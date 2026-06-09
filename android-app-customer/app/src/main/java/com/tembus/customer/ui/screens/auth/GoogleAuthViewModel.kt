package com.tembus.customer.ui.screens.auth

import android.content.Context
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.GetCredentialResponse
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.android.libraries.identity.googleid.GoogleIdTokenParsingException
import com.tembus.customer.config.AppConfig
import com.tembus.customer.data.repository.GoogleAuthRepository
import com.tembus.customer.data.store.AuthTokenStore
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

// ─────────────────────────────────────────────
// UI State
// ─────────────────────────────────────────────

sealed class GoogleAuthUiState {
    object Idle : GoogleAuthUiState()
    object Loading : GoogleAuthUiState()
    data class RequiresOtp(
        val challengeId: String,
        val maskedRecipient: String,
        val channel: String,
        val transactionId: String
    ) : GoogleAuthUiState()
    data class RequiresPhone(
        val email: String,
        val fullName: String,
        val transactionId: String
    ) : GoogleAuthUiState()
    object Authenticated : GoogleAuthUiState()
    data class Error(val message: String) : GoogleAuthUiState()
}

sealed class OtpUiState {
    object Idle : OtpUiState()
    object Sending : OtpUiState()
    data class Sent(
        val challengeId: String,
        val maskedRecipient: String,
        val channel: String,
        val expiresInSeconds: Int,
        val resendCooldownSeconds: Int
    ) : OtpUiState()
    object Verifying : OtpUiState()
    object Verified : OtpUiState()
    data class Error(val message: String) : OtpUiState()
}

// ─────────────────────────────────────────────
// ViewModel
// ─────────────────────────────────────────────

@HiltViewModel
class GoogleAuthViewModel @Inject constructor(
    private val googleAuthRepository: GoogleAuthRepository,
    private val authTokenStore: AuthTokenStore
) : ViewModel() {

    private val _googleAuthState = MutableStateFlow<GoogleAuthUiState>(GoogleAuthUiState.Idle)
    val googleAuthState: StateFlow<GoogleAuthUiState> = _googleAuthState.asStateFlow()

    private val _otpState = MutableStateFlow<OtpUiState>(OtpUiState.Idle)
    val otpState: StateFlow<OtpUiState> = _otpState.asStateFlow()

    // Held in memory for the duration of the auth flow — never persisted to disk
    private var pendingNonce: String? = null
    private var pendingTransactionId: String? = null
    private var pendingChallengeId: String? = null
    private var pendingMaskedRecipient: String? = null

    // ─────────────────────────────────────────────
    // Google Sign-In via Credential Manager
    // ─────────────────────────────────────────────

    /**
     * signInWithGoogle
     *
     * Flow:
     *   1. Call backend /google/start → receive nonce + transactionId
     *   2. Build GetGoogleIdOption with that nonce
     *   3. Launch Credential Manager picker
     *   4. On success, extract ID token → call /google/complete
     *   5. Route based on status
     */
    fun signInWithGoogle(context: Context) {
        if (_googleAuthState.value is GoogleAuthUiState.Loading) return
        viewModelScope.launch {
            _googleAuthState.value = GoogleAuthUiState.Loading

            // Step 1: Get nonce + transaction ID from backend
            val startResult = googleAuthRepository.startGoogleAuth()
            if (startResult.isFailure) {
                _googleAuthState.value = GoogleAuthUiState.Error(
                    startResult.exceptionOrNull()?.message
                        ?: "Gagal memulai login Google. Coba lagi."
                )
                return@launch
            }

            val startData = startResult.getOrThrow()
            pendingNonce = startData.nonce
            pendingTransactionId = startData.transactionId

            // Step 2: Build the Credential Manager request
            val googleIdOption = GetGoogleIdOption.Builder()
                .setFilterByAuthorizedAccounts(false) // allow all Google accounts
                .setServerClientId(AppConfig.GOOGLE_SERVER_CLIENT_ID)
                .setNonce(startData.nonce)
                .setAutoSelectEnabled(false)
                .build()

            val request = GetCredentialRequest.Builder()
                .addCredentialOption(googleIdOption)
                .build()

            // Step 3: Launch Credential Manager
            val credentialManager = CredentialManager.create(context)
            try {
                val credentialResponse: GetCredentialResponse =
                    credentialManager.getCredential(context = context, request = request)
                handleCredentialResponse(credentialResponse)
            } catch (e: GetCredentialCancellationException) {
                _googleAuthState.value = GoogleAuthUiState.Idle
            } catch (e: NoCredentialException) {
                _googleAuthState.value = GoogleAuthUiState.Error(
                    "Tidak ada akun Google yang tersedia di perangkat ini."
                )
            } catch (e: GetCredentialException) {
                _googleAuthState.value = GoogleAuthUiState.Error(
                    "Login Google gagal. Periksa koneksi internet dan coba lagi."
                )
            }
        }
    }

    private suspend fun handleCredentialResponse(response: GetCredentialResponse) {
        val credential = response.credential
        if (credential !is CustomCredential ||
            credential.type != GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
        ) {
            _googleAuthState.value = GoogleAuthUiState.Error("Tipe kredensial tidak didukung.")
            return
        }

        val googleIdTokenCredential = try {
            GoogleIdTokenCredential.createFrom(credential.data)
        } catch (e: GoogleIdTokenParsingException) {
            _googleAuthState.value = GoogleAuthUiState.Error("Token Google tidak valid. Coba lagi.")
            return
        }

        // Step 4: Send ID token to backend
        val completeResult = googleAuthRepository.completeGoogleAuth(
            idToken = googleIdTokenCredential.idToken,
            nonce = pendingNonce,
            transactionId = pendingTransactionId
        )

        if (completeResult.isFailure) {
            _googleAuthState.value = GoogleAuthUiState.Error(
                completeResult.exceptionOrNull()?.message
                    ?: "Verifikasi Google gagal. Coba lagi."
            )
            return
        }

        // Step 5: Route based on backend status
        val data = completeResult.getOrThrow()
        when (data.status) {
            "authenticated" -> {
                if (data.accessToken != null) {
                    authTokenStore.saveTokens(
                        accessToken = data.accessToken,
                        refreshToken = data.refreshToken
                    )
                }
                pendingNonce = null
                pendingTransactionId = null
                _googleAuthState.value = GoogleAuthUiState.Authenticated
            }
            "requires_step_up_otp" -> {
                val txId = data.transactionId ?: pendingTransactionId ?: ""
                pendingChallengeId = data.transactionId
                pendingMaskedRecipient = data.maskedRecipient
                _googleAuthState.value = GoogleAuthUiState.RequiresOtp(
                    challengeId = data.transactionId ?: "",
                    maskedRecipient = data.maskedRecipient ?: "",
                    channel = data.preferredChannel ?: "whatsapp",
                    transactionId = txId
                )
            }
            "requires_phone" -> {
                val txId = data.transactionId ?: pendingTransactionId ?: ""
                _googleAuthState.value = GoogleAuthUiState.RequiresPhone(
                    email = data.email ?: "",
                    fullName = data.fullName ?: "",
                    transactionId = txId
                )
            }
            "blocked" -> {
                _googleAuthState.value = GoogleAuthUiState.Error(
                    "Akun kamu sementara tidak dapat diakses. Hubungi dukungan pelanggan."
                )
            }
            else -> {
                _googleAuthState.value = GoogleAuthUiState.Error(
                    "Respons tidak dikenal dari server. Coba lagi."
                )
            }
        }
    }

    // ─────────────────────────────────────────────
    // OTP Operations
    // ─────────────────────────────────────────────

    /**
     * sendOtp — sends OTP to the phone number.
     * Optionally tied to a Google auth transaction for step-up flows.
     */
    fun sendOtp(
        phoneNumber: String,
        channel: String = "whatsapp",
        transactionId: String? = null
    ) {
        if (_otpState.value is OtpUiState.Sending) return
        viewModelScope.launch {
            _otpState.value = OtpUiState.Sending
            val result = googleAuthRepository.sendCustomerOtp(
                phoneNumber = phoneNumber,
                channel = channel,
                transactionId = transactionId
            )
            if (result.isSuccess) {
                val data = result.getOrThrow()
                pendingChallengeId = data.challengeId
                pendingMaskedRecipient = data.maskedRecipient
                _otpState.value = OtpUiState.Sent(
                    challengeId = data.challengeId,
                    maskedRecipient = data.maskedRecipient,
                    channel = data.channel,
                    expiresInSeconds = data.expiresInSeconds,
                    resendCooldownSeconds = data.resendCooldownSeconds
                )
            } else {
                _otpState.value = OtpUiState.Error(
                    result.exceptionOrNull()?.message ?: "Kode OTP belum dapat dikirim. Coba lagi."
                )
            }
        }
    }

    /**
     * verifyOtp — verifies the OTP code entered by the user.
     */
    fun verifyOtp(
        code: String,
        phoneNumber: String
    ) {
        val challengeId = pendingChallengeId ?: run {
            _otpState.value = OtpUiState.Error("Sesi OTP tidak valid. Minta kode baru.")
            return
        }
        if (_otpState.value is OtpUiState.Verifying) return

        viewModelScope.launch {
            _otpState.value = OtpUiState.Verifying
            val result = googleAuthRepository.verifyCustomerOtp(
                challengeId = challengeId,
                code = code,
                phoneNumber = phoneNumber
            )
            if (result.isSuccess) {
                val data = result.getOrThrow()
                if (data.accessToken != null) {
                    authTokenStore.saveTokens(
                        accessToken = data.accessToken,
                        refreshToken = data.refreshToken
                    )
                }
                pendingChallengeId = null
                pendingMaskedRecipient = null
                _otpState.value = OtpUiState.Verified
                _googleAuthState.value = GoogleAuthUiState.Authenticated
            } else {
                _otpState.value = OtpUiState.Error(
                    result.exceptionOrNull()?.message
                        ?: "Kode OTP tidak valid atau sudah kedaluwarsa."
                )
            }
        }
    }

    // ─────────────────────────────────────────────
    // State management
    // ─────────────────────────────────────────────

    fun resetGoogleAuthState() {
        pendingNonce = null
        pendingTransactionId = null
        _googleAuthState.value = GoogleAuthUiState.Idle
    }

    fun resetOtpState() {
        _otpState.value = OtpUiState.Idle
    }

    fun clearOtpError() {
        if (_otpState.value is OtpUiState.Error) {
            _otpState.value = OtpUiState.Idle
        }
    }
}
