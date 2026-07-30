package com.tembus.customer.ui.screens.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.firebase.messaging.FirebaseMessaging
import com.tembus.customer.data.model.UpdateProfileRequest
import com.tembus.customer.data.repository.AuthRepository
import com.tembus.customer.data.repository.NotificationRepository
import com.tembus.customer.data.repository.ProfileRepository
import com.tembus.customer.data.session.AuthSessionManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject
import com.tembus.customer.config.AppConfig

sealed class AuthState {
    object Idle : AuthState()
    object Loading : AuthState()
    object OtpSent : AuthState()
    data class Success(val isNewUser: Boolean = false) : AuthState()
    object ProfileCompleted : AuthState()
    data class Error(val message: String) : AuthState()
}

sealed class PasswordResetState {
    object Idle : PasswordResetState()
    object Sending : PasswordResetState()
    data class CodeSent(val email: String, val message: String) : PasswordResetState()
    object Confirming : PasswordResetState()
    data class Completed(val message: String) : PasswordResetState()
    data class Error(val message: String) : PasswordResetState()
}

@HiltViewModel
class AuthViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val sessionManager: AuthSessionManager,
    private val notificationRepository: NotificationRepository,
    private val profileRepository: ProfileRepository
) : ViewModel() {
    private val technicalErrorMarkers = listOf(
        "HTTP ",
        "Exception",
        "retrofit",
        "okhttp",
        "java.",
        "kotlin.",
        "failed to",
        "Unable to",
        "UnknownHost",
        "timeout",
        "SSL",
        "certificate",
        "stack"
    )

    private val _authState = MutableStateFlow<AuthState>(AuthState.Idle)
    val authState: StateFlow<AuthState> = _authState.asStateFlow()

    private val _passwordResetState = MutableStateFlow<PasswordResetState>(PasswordResetState.Idle)
    val passwordResetState: StateFlow<PasswordResetState> = _passwordResetState.asStateFlow()

    private val _phoneNumber = MutableStateFlow("")
    val phoneNumber: StateFlow<String> = _phoneNumber.asStateFlow()

    private val _password = MutableStateFlow("")
    val password: StateFlow<String> = _password.asStateFlow()

    private val _pendingRegistrationName = MutableStateFlow("")
    val pendingRegistrationName: StateFlow<String> = _pendingRegistrationName.asStateFlow()

    private val _pendingRegistrationPhone = MutableStateFlow("")

    private val _agreedToTerms = MutableStateFlow(false)
    val agreedToTerms: StateFlow<Boolean> = _agreedToTerms.asStateFlow()

    fun setPhoneNumber(phone: String) {
        _phoneNumber.value = phone
    }

    fun setPassword(password: String) {
        _password.value = password
    }

    fun setPendingRegistrationProfile(name: String, phone: String) {
        _pendingRegistrationName.value = name.trim()
        _pendingRegistrationPhone.value = phone.filter { it.isDigit() }
    }

    fun setAgreedToTerms(agreed: Boolean) {
        _agreedToTerms.value = agreed
    }

    fun requestOtp() {
        val phone = _phoneNumber.value
        val minLen = if (AppConfig.IS_EMAIL_AUTH_ENABLED) 5 else 9
        val isEmailMode = AppConfig.IS_EMAIL_AUTH_ENABLED
        
        val isValid = if (isEmailMode) {
            val emailRegex = Regex("^[A-Za-z0-9+_.-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}\$")
            emailRegex.matches(phone)
        } else {
            phone.length >= minLen
        }

        if (!isValid) {
            _authState.value = AuthState.Error(if (isEmailMode) "Email tidak valid" else "Nomor HP tidak valid")
            return
        }
        
        viewModelScope.launch {
            _authState.value = AuthState.Loading
            val result = authRepository.requestOtp(phone)
            
            result.onSuccess {
                _authState.value = AuthState.OtpSent
            }.onFailure { exception ->
                _authState.value = AuthState.Error(
                    userSafeMessage(exception.localizedMessage, "Kode verifikasi belum dapat dikirim. Coba lagi.")
                )
            }
        }
    }

    fun startPasswordLogin() {
        val email = _phoneNumber.value.trim()
        val password = _password.value
        val emailRegex = Regex("^[A-Za-z0-9+_.-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}\$")
        if (!emailRegex.matches(email)) {
            _authState.value = AuthState.Error("Email tidak valid")
            return
        }
        if (password.length < 8) {
            _authState.value = AuthState.Error("Password minimal 8 karakter")
            return
        }

        viewModelScope.launch {
            _authState.value = AuthState.Loading
            authRepository.startPasswordLogin(email, password)
                .onSuccess { response ->
                    if (response.requiresOtpChallenge()) {
                        _authState.value = AuthState.OtpSent
                    } else {
                        completeAuthenticatedSession(response)
                    }
                }
                .onFailure { exception ->
                    _authState.value = AuthState.Error(
                        userSafeMessage(exception.localizedMessage, "Email atau password tidak sesuai.")
                    )
                }
        }
    }

    fun startPasswordRegistration() {
        val fullName = _pendingRegistrationName.value.trim()
        val phone = _pendingRegistrationPhone.value
        val email = _phoneNumber.value.trim()
        val password = _password.value
        val emailRegex = Regex("^[A-Za-z0-9+_.-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}\$")
        if (fullName.length < 2) {
            _authState.value = AuthState.Error("Nama lengkap minimal 2 karakter")
            return
        }
        if (phone.length < 9) {
            _authState.value = AuthState.Error("Nomor handphone tidak valid")
            return
        }
        if (!emailRegex.matches(email)) {
            _authState.value = AuthState.Error("Email tidak valid")
            return
        }
        if (password.length < 8) {
            _authState.value = AuthState.Error("Password minimal 8 karakter")
            return
        }

        viewModelScope.launch {
            _authState.value = AuthState.Loading
            authRepository.startPasswordRegistration(fullName, email, phone, password)
                .onSuccess { _authState.value = AuthState.OtpSent }
                .onFailure { exception ->
                    _authState.value = AuthState.Error(
                        userSafeMessage(exception.localizedMessage, "Pendaftaran belum dapat diproses. Coba lagi.")
                    )
                }
        }
    }

    fun requestPasswordReset(email: String) {
        val normalizedEmail = email.trim()
        val emailRegex = Regex("^[A-Za-z0-9+_.-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}\$")
        if (!emailRegex.matches(normalizedEmail)) {
            _passwordResetState.value = PasswordResetState.Error("Email tidak valid")
            return
        }

        viewModelScope.launch {
            _passwordResetState.value = PasswordResetState.Sending
            authRepository.requestPasswordReset(normalizedEmail)
                .onSuccess { response ->
                    _passwordResetState.value = PasswordResetState.CodeSent(
                        email = normalizedEmail,
                        message = response.message ?: "Jika email terdaftar, kode reset sudah dikirim."
                    )
                }
                .onFailure { exception ->
                    _passwordResetState.value = PasswordResetState.Error(
                        userSafeMessage(exception.localizedMessage, "Kode reset belum dapat dikirim. Coba lagi.")
                    )
                }
        }
    }

    fun confirmPasswordReset(email: String, code: String, newPassword: String) {
        val normalizedEmail = email.trim()
        val resetCode = code.trim()
        val emailRegex = Regex("^[A-Za-z0-9+_.-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}\$")
        if (!emailRegex.matches(normalizedEmail)) {
            _passwordResetState.value = PasswordResetState.Error("Email tidak valid")
            return
        }
        if (!resetCode.matches(Regex("^\\d{6}\$"))) {
            _passwordResetState.value = PasswordResetState.Error("Kode reset harus 6 digit")
            return
        }
        if (newPassword.length < 8) {
            _passwordResetState.value = PasswordResetState.Error("Password baru minimal 8 karakter")
            return
        }

        viewModelScope.launch {
            _passwordResetState.value = PasswordResetState.Confirming
            authRepository.confirmPasswordReset(normalizedEmail, resetCode, newPassword)
                .onSuccess { response ->
                    _password.value = ""
                    _passwordResetState.value = PasswordResetState.Completed(
                        response.message ?: "Password berhasil diperbarui. Silakan masuk kembali."
                    )
                }
                .onFailure { exception ->
                    _passwordResetState.value = PasswordResetState.Error(
                        userSafeMessage(exception.localizedMessage, "Kode reset tidak valid atau sudah kedaluwarsa.")
                    )
                }
        }
    }

    fun verifyOtp(code: String) {
        val phone = _phoneNumber.value
        viewModelScope.launch {
            _authState.value = AuthState.Loading
            val result = authRepository.verifyOtp(phone, code)
            
            result.onSuccess { response ->
                completeAuthenticatedSession(response)
            }.onFailure { exception ->
                _authState.value = AuthState.Error(
                    userSafeMessage(exception.localizedMessage, "Kode OTP tidak valid.")
                )
            }
        }
    }

    fun resetState() {
        _authState.value = AuthState.Idle
    }

    fun resetPasswordResetState() {
        _passwordResetState.value = PasswordResetState.Idle
    }

    fun completeProfile(fullName: String) {
        val cleanName = fullName.trim()
        if (cleanName.length < 2) {
            _authState.value = AuthState.Error("Nama lengkap minimal 2 karakter")
            return
        }

        if (!_agreedToTerms.value) {
            _authState.value = AuthState.Error("Harap setujui Syarat & Ketentuan dan Kebijakan Privasi TEMBUS")
            return
        }

        viewModelScope.launch {
            _authState.value = AuthState.Loading
            profileRepository.updateProfile(
                UpdateProfileRequest(
                    name = cleanName,
                    phoneNumber = _pendingRegistrationPhone.value.ifBlank { _phoneNumber.value },
                    agreedToTerms = true
                )
            ).collect { result ->
                result.onSuccess { profile ->
                    sessionManager.updateCustomerName(profile.name)
                    _authState.value = AuthState.ProfileCompleted
                }.onFailure { exception ->
                    _authState.value = AuthState.Error(
                        userSafeMessage(exception.localizedMessage, "Profil belum dapat disimpan. Coba lagi.")
                    )
                }
            }
        }
    }

    private fun syncFcmToken() {
        try {
            FirebaseMessaging.getInstance().token
                .addOnSuccessListener { token ->
                    if (!token.isNullOrBlank()) {
                        viewModelScope.launch {
                            notificationRepository.registerDeviceToken(token)
                        }
                    }
                }
        } catch (_: RuntimeException) {
            // Firebase may be unavailable in JVM unit tests or early app bootstrap.
        }
    }

    private suspend fun completeAuthenticatedSession(response: com.tembus.customer.data.model.AuthResponse) {
        val data = response.data
        val token = data?.token ?: response.accessToken
        val customerId = data?.customerId ?: response.user?.id
        val customerName = data?.name ?: response.user?.fullName ?: response.user?.name
        if (!token.isNullOrBlank() && !customerId.isNullOrBlank()) {
            sessionManager.saveSession(
                token = token,
                id = customerId,
                name = customerName
            )
            val needsProfile = response.isNewUser ||
                customerName.isNullOrBlank() ||
                customerName.equals("New User", ignoreCase = true)
            _authState.value = AuthState.Success(isNewUser = needsProfile)
            syncFcmToken()
        } else {
            _authState.value = AuthState.Error("Sesi belum dapat dibuat. Coba lagi beberapa saat.")
        }
    }

    private fun userSafeMessage(raw: String?, fallback: String): String {
        val message = raw?.trim().orEmpty()
        if (message.isBlank()) return fallback
        return if (technicalErrorMarkers.any { marker -> message.contains(marker, ignoreCase = true) }) {
            fallback
        } else {
            message.take(160)
        }
    }

    private fun com.tembus.customer.data.model.AuthResponse.requiresOtpChallenge(): Boolean {
        if (requireOtp) return true
        val normalizedMessage = message.orEmpty().lowercase()
        return normalizedMessage.contains("otp") &&
            (
                normalizedMessage.contains("sent") ||
                    normalizedMessage.contains("dikirim") ||
                    normalizedMessage.contains("terkirim")
            )
    }
}
