package com.tembus.courier.ui.screens.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.courier.data.api.TEMBUSApiService
import com.tembus.courier.data.model.ConfirmPasswordResetRequest
import com.tembus.courier.data.model.ForgotPasswordRequest
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import retrofit2.Response
import javax.inject.Inject

enum class ForgotPasswordStep {
    EMAIL_INPUT,
    OTP_VERIFICATION,
    NEW_PASSWORD
}

data class ForgotPasswordUiState(
    val step: ForgotPasswordStep = ForgotPasswordStep.EMAIL_INPUT,
    val email: String = "",
    val otpCode: String = "",
    val newPassword: String = "",
    val confirmPassword: String = "",
    val isLoading: Boolean = false,
    val error: String? = null,
    val emailError: String? = null,
    val otpError: String? = null,
    val passwordError: String? = null,
    val isSuccess: Boolean = false
)

@HiltViewModel
class ForgotPasswordViewModel @Inject constructor(
    private val apiService: TEMBUSApiService
) : ViewModel() {

    private val _uiState = MutableStateFlow(ForgotPasswordUiState())
    val uiState: StateFlow<ForgotPasswordUiState> = _uiState.asStateFlow()

    private val errorJson = Json {
        ignoreUnknownKeys = true
        isLenient = true
    }

    private val technicalErrorMarkers = listOf(
        "java.", "kotlin.", "retrofit", "okhttp", "Exception", "timeout"
    )

    fun onEmailChange(value: String) {
        _uiState.update { it.copy(email = value, emailError = null, error = null) }
    }

    fun onOtpCodeChange(value: String) {
        if (value.all { it.isDigit() } && value.length <= 6) {
            _uiState.update { it.copy(otpCode = value, otpError = null, error = null) }
        }
    }

    fun onNewPasswordChange(value: String) {
        _uiState.update { it.copy(newPassword = value, passwordError = null, error = null) }
    }

    fun onConfirmPasswordChange(value: String) {
        _uiState.update { it.copy(confirmPassword = value, passwordError = null, error = null) }
    }

    fun clearError() {
        _uiState.update { it.copy(error = null) }
    }

    fun requestOtp() {
        val state = _uiState.value
        if (state.email.isBlank() || !android.util.Patterns.EMAIL_ADDRESS.matcher(state.email).matches()) {
            _uiState.update { it.copy(emailError = "Format email tidak valid") }
            return
        }

        _uiState.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            try {
                val response = apiService.requestPasswordReset(ForgotPasswordRequest(email = state.email))
                val responseBody = response.body()
                
                if (response.isSuccessful || responseBody?.success == true) {
                    _uiState.update { it.copy(isLoading = false, step = ForgotPasswordStep.OTP_VERIFICATION) }
                } else {
                    val rawMessage = extractErrorMessage(response) ?: responseBody?.message
                    val message = userSafeMessage(rawMessage, "Gagal mengirim OTP. Pastikan email terdaftar.")
                    _uiState.update { it.copy(isLoading = false, error = message) }
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        error = userSafeMessage(e.message, "Tidak ada koneksi atau server bermasalah.")
                    )
                }
            }
        }
    }

    fun verifyOtpAndProceed() {
        val state = _uiState.value
        if (state.otpCode.length != 6) {
            _uiState.update { it.copy(otpError = "Masukkan 6 digit kode OTP") }
            return
        }
        
        // We just move to next step, backend verifies on the final call
        _uiState.update { it.copy(step = ForgotPasswordStep.NEW_PASSWORD, error = null) }
    }

    fun confirmPasswordReset() {
        val state = _uiState.value
        
        if (state.newPassword.length < 8) {
            _uiState.update { it.copy(passwordError = "Password minimal 8 karakter") }
            return
        }
        if (state.newPassword != state.confirmPassword) {
            _uiState.update { it.copy(passwordError = "Konfirmasi password tidak cocok") }
            return
        }

        _uiState.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            try {
                val response = apiService.confirmPasswordReset(
                    ConfirmPasswordResetRequest(
                        email = state.email,
                        code = state.otpCode,
                        newPassword = state.newPassword
                    )
                )
                
                val responseBody = response.body()
                if (response.isSuccessful || responseBody?.success == true) {
                    _uiState.update { it.copy(isLoading = false, isSuccess = true) }
                } else {
                    val rawMessage = extractErrorMessage(response) ?: responseBody?.message
                    val message = userSafeMessage(rawMessage, "Kode OTP salah atau kedaluwarsa.")
                    _uiState.update { it.copy(isLoading = false, error = message) }
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        error = userSafeMessage(e.message, "Gagal mereset password. Coba lagi.")
                    )
                }
            }
        }
    }

    private fun extractErrorMessage(response: Response<*>): String? {
        val rawErrorBody = response.errorBody()?.string()?.trim().orEmpty()
        if (rawErrorBody.isBlank()) return null
        return runCatching {
            val errorObject = errorJson.parseToJsonElement(rawErrorBody).jsonObject
            errorObject["message"]?.jsonPrimitive?.contentOrNull
                ?: errorObject["error"]?.jsonPrimitive?.contentOrNull
        }.getOrNull() ?: rawErrorBody.takeIf { it.length <= 180 }
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
}
