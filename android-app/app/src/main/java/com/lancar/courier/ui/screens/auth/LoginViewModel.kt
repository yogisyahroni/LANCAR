package com.lancar.courier.ui.screens.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.lancar.courier.data.api.LANCARApiService
import com.lancar.courier.data.model.LoginRequest
import com.lancar.courier.data.session.AuthSessionManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class LoginUiState(
    val username: String = "",
    val password: String = "",
    val isLoading: Boolean = false,
    val isLoggedIn: Boolean = false,
    val error: String? = null,
    val usernameError: String? = null,
    val passwordError: String? = null
)

/**
 * Login ViewModel
 *
 * Handles courier authentication against the backend auth-service.
 * Validates input, calls POST /api/v1/auth/courier/login,
 * and persists the session via AuthSessionManager.
 */
@HiltViewModel
class LoginViewModel @Inject constructor(
    private val authSessionManager: AuthSessionManager,
    private val apiService: LANCARApiService
) : ViewModel() {

    private val _uiState = MutableStateFlow(LoginUiState())
    val uiState: StateFlow<LoginUiState> = _uiState.asStateFlow()

    fun onUsernameChange(value: String) {
        _uiState.update { it.copy(username = value, usernameError = null, error = null) }
    }

    fun onPasswordChange(value: String) {
        _uiState.update { it.copy(password = value, passwordError = null, error = null) }
    }

    fun clearError() {
        _uiState.update { it.copy(error = null) }
    }

    /**
     * Validate fields before submission
     */
    private fun validate(): Boolean {
        val state = _uiState.value
        var isValid = true

        if (state.username.isBlank()) {
            _uiState.update { it.copy(usernameError = "Username tidak boleh kosong") }
            isValid = false
        }

        if (state.password.length < 4) {
            _uiState.update { it.copy(passwordError = "Password minimal 4 karakter") }
            isValid = false
        }

        return isValid
    }

    /**
     * Perform login against backend auth-service
     */
    fun login() {
        if (!validate()) return

        val state = _uiState.value
        _uiState.update { it.copy(isLoading = true, error = null) }

        viewModelScope.launch {
            try {
                val response = apiService.login(
                    LoginRequest(
                        username = state.username.trim(),
                        password = state.password
                    )
                )

                val responseBody = response.body()
                if (response.isSuccessful && responseBody?.success == true) {
                    val loginData = responseBody.data
                    if (loginData == null) {
                        _uiState.update {
                            it.copy(isLoading = false, error = "Login gagal: data sesi kosong dari server")
                        }
                        return@launch
                    }

                    // Persist session to DataStore
                    authSessionManager.saveSession(
                        authToken = loginData.token,
                        courierId = loginData.courierId,
                        courierName = loginData.name
                    )
                    _uiState.update { it.copy(isLoading = false, isLoggedIn = true) }
                } else {
                    val message = responseBody?.message
                        ?: when (response.code()) {
                            401 -> "Username atau password salah"
                            403 -> "Akun tidak memiliki akses kurir"
                            429 -> "Terlalu banyak percobaan. Coba lagi nanti"
                            else -> "Login gagal (${response.code()})"
                        }
                    _uiState.update { it.copy(isLoading = false, error = message) }
                }
            } catch (e: java.net.UnknownHostException) {
                _uiState.update {
                    it.copy(isLoading = false, error = "Tidak ada koneksi internet")
                }
            } catch (e: java.net.SocketTimeoutException) {
                _uiState.update {
                    it.copy(isLoading = false, error = "Server tidak merespons. Coba lagi")
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(isLoading = false, error = "Error: ${e.message}")
                }
            }
        }
    }
}
