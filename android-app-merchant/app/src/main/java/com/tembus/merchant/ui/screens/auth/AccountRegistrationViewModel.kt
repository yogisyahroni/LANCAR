package com.tembus.merchant.ui.screens.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.merchant.data.repository.AuthRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

enum class AccountRegistrationStep {
    FORM,
    OTP
}

data class AccountRegistrationUiState(
    val step: AccountRegistrationStep = AccountRegistrationStep.FORM,
    val fullName: String = "",
    val email: String = "",
    val phoneNumber: String = "",
    val password: String = "",
    val passwordConfirmation: String = "",
    val otp: String = "",
    val isLoading: Boolean = false,
    val errorMessage: String? = null
)

class AccountRegistrationViewModel(
    private val authRepository: AuthRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(AccountRegistrationUiState())
    val uiState: StateFlow<AccountRegistrationUiState> = _uiState.asStateFlow()

    fun onFullNameChange(value: String) {
        update { it.copy(fullName = value, errorMessage = null) }
    }

    fun onEmailChange(value: String) {
        update { it.copy(email = value, errorMessage = null) }
    }

    fun onPhoneChange(value: String) {
        update { it.copy(phoneNumber = value.filter(Char::isDigit), errorMessage = null) }
    }

    fun onPasswordChange(value: String) {
        update { it.copy(password = value, errorMessage = null) }
    }

    fun onPasswordConfirmationChange(value: String) {
        update { it.copy(passwordConfirmation = value, errorMessage = null) }
    }

    fun onOtpChange(value: String) {
        update { it.copy(otp = value.filter(Char::isDigit).take(6), errorMessage = null) }
    }

    fun startRegistration() {
        val state = _uiState.value
        val fullName = state.fullName.trim()
        val email = state.email.trim().lowercase()
        val phone = state.phoneNumber.trim()

        when {
            fullName.length < 2 -> return showError("Nama lengkap minimal 2 karakter")
            !EMAIL_PATTERN.matches(email) -> return showError("Email tidak valid")
            phone.length < 9 -> return showError("Nomor handphone tidak valid")
            state.password.length < 8 -> return showError("Password minimal 8 karakter")
            state.password != state.passwordConfirmation -> return showError("Ulangi password harus sama")
        }

        update {
            it.copy(
                step = AccountRegistrationStep.FORM,
                email = email,
                fullName = fullName,
                phoneNumber = phone,
                isLoading = true,
                errorMessage = null
            )
        }
        viewModelScope.launch {
            authRepository.startAccountRegistration(fullName, email, phone, state.password)
                .onSuccess { response ->
                    if (response.accessToken != null || response.data?.token != null) {
                        authRepository.saveSessionFromAuth(response, email)
                            .onSuccess { update { it.copy(isLoading = false) } }
                            .onFailure { error -> showError(error.message ?: "Akun belum dapat diaktifkan") }
                    } else {
                        update {
                            it.copy(
                                step = AccountRegistrationStep.OTP,
                                otp = "",
                                isLoading = false,
                                errorMessage = null
                            )
                        }
                    }
                }
                .onFailure { error ->
                    showError(error.message ?: "Pendaftaran akun belum dapat diproses. Coba lagi.")
                }
        }
    }

    fun verifyOtp() {
        val state = _uiState.value
        if (!state.otp.matches(Regex("^\\d{6}$"))) {
            showError("Kode verifikasi harus 6 digit")
            return
        }

        update { it.copy(isLoading = true, errorMessage = null) }
        viewModelScope.launch {
            authRepository.verifyAccountRegistrationOtp(state.email, state.otp)
                .onSuccess { update { it.copy(isLoading = false) } }
                .onFailure { error -> showError(error.message ?: "Kode verifikasi tidak sesuai atau sudah kedaluwarsa.") }
        }
    }

    fun backToForm() {
        update { it.copy(step = AccountRegistrationStep.FORM, otp = "", errorMessage = null) }
    }

    fun clearError() {
        update { it.copy(errorMessage = null) }
    }

    private fun showError(message: String) {
        update { it.copy(isLoading = false, errorMessage = message) }
    }

    private fun update(transform: (AccountRegistrationUiState) -> AccountRegistrationUiState) {
        _uiState.value = transform(_uiState.value)
    }

    private companion object {
        val EMAIL_PATTERN = Regex("^[A-Za-z0-9+_.-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$")
    }
}
