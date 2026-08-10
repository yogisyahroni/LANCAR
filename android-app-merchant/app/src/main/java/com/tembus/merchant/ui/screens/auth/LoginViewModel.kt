package com.tembus.merchant.ui.screens.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.merchant.data.onboarding.OnboardingPreferences
import com.tembus.merchant.data.repository.AuthRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class LoginUiState(
    val email: String = "",
    val password: String = "",
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val loginSuccess: Boolean = false,
    val hadLoggedIn: Boolean = false
)

class LoginViewModel(
    private val authRepository: AuthRepository,
    private val onboardingPreferences: OnboardingPreferences
) : ViewModel() {

    private val _uiState = MutableStateFlow(LoginUiState())
    val uiState: StateFlow<LoginUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            onboardingPreferences.hadLoggedIn.collect { hadLoggedIn ->
                _uiState.value = _uiState.value.copy(hadLoggedIn = hadLoggedIn)
            }
        }
    }

    fun onEmailChange(value: String) {
        _uiState.value = _uiState.value.copy(email = value, errorMessage = null)
    }

    fun onPasswordChange(value: String) {
        _uiState.value = _uiState.value.copy(password = value, errorMessage = null)
    }

    fun login() {
        val state = _uiState.value
        if (state.email.isBlank() || state.password.isBlank()) {
            _uiState.value = state.copy(errorMessage = "Email dan password wajib diisi")
            return
        }
        _uiState.value = state.copy(isLoading = true, errorMessage = null)
        viewModelScope.launch {
            authRepository.login(state.email, state.password)
                .onSuccess {
                    _uiState.value = _uiState.value.copy(isLoading = false, loginSuccess = true)
                }
                .onFailure { e ->
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        errorMessage = e.message ?: "Login gagal"
                    )
                }
        }
    }

    fun resetError() {
        _uiState.value = _uiState.value.copy(errorMessage = null)
    }
}
