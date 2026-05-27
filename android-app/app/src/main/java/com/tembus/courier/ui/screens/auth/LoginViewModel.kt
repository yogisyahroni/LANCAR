package com.tembus.courier.ui.screens.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.courier.data.api.TEMBUSApiService
import com.tembus.courier.data.device.DeviceIdentityProvider
import com.tembus.courier.data.model.CourierOtpVerifyRequest
import com.tembus.courier.data.model.LoginData
import com.tembus.courier.data.model.LoginRequest
import com.tembus.courier.data.session.AuthSessionManager
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

data class LoginUiState(
    val username: String = "",
    val password: String = "",
    val otpCode: String = "",
    val requiresOtp: Boolean = false,
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
    private val apiService: TEMBUSApiService,
    private val deviceIdentityProvider: DeviceIdentityProvider
) : ViewModel() {

    private val _uiState = MutableStateFlow(LoginUiState())
    val uiState: StateFlow<LoginUiState> = _uiState.asStateFlow()

    private val errorJson = Json {
        ignoreUnknownKeys = true
        isLenient = true
    }

    fun onUsernameChange(value: String) {
        _uiState.update { it.copy(username = value, usernameError = null, error = null) }
    }

    fun onPasswordChange(value: String) {
        _uiState.update { it.copy(password = value, passwordError = null, error = null) }
    }

    fun onOtpCodeChange(value: String) {
        if (value.all { it.isDigit() } && value.length <= 6) {
            _uiState.update { it.copy(otpCode = value, error = null) }
        }
    }

    fun cancelOtpChallenge() {
        _uiState.update { it.copy(requiresOtp = false, otpCode = "", error = null) }
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
                        password = state.password,
                        deviceId = deviceIdentityProvider.deviceId(),
                        deviceInfo = deviceIdentityProvider.deviceInfo()
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

                    if (loginData.requiresOtp) {
                        _uiState.update {
                            it.copy(
                                isLoading = false,
                                requiresOtp = true,
                                otpCode = "",
                                error = null
                            )
                        }
                        return@launch
                    }

                    persistLoginSession(loginData)
                } else {
                    val message = extractErrorMessage(response)
                        ?: responseBody?.message
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

    fun verifyOtp() {
        val state = _uiState.value
        if (state.otpCode.length != 6) {
            _uiState.update { it.copy(error = "Masukkan 6 digit kode OTP") }
            return
        }

        _uiState.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            try {
                val response = apiService.verifyCourierLoginOtp(
                    CourierOtpVerifyRequest(
                        username = state.username.trim(),
                        code = state.otpCode,
                        deviceId = deviceIdentityProvider.deviceId(),
                        deviceInfo = deviceIdentityProvider.deviceInfo()
                    )
                )
                val responseBody = response.body()
                if (response.isSuccessful && responseBody?.success == true && responseBody.data != null) {
                    persistLoginSession(responseBody.data)
                } else {
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            error = extractErrorMessage(response)
                                ?: responseBody?.message
                                ?: "Kode OTP tidak valid"
                        )
                    }
                }
            } catch (e: java.net.UnknownHostException) {
                _uiState.update { it.copy(isLoading = false, error = "Tidak ada koneksi internet") }
            } catch (e: java.net.SocketTimeoutException) {
                _uiState.update { it.copy(isLoading = false, error = "Server tidak merespons. Coba lagi") }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = "Error: ${e.message}") }
            }
        }
    }

    private suspend fun persistLoginSession(loginData: LoginData) {
        val token = loginData.token
        val courierId = loginData.courierId
        val courierName = loginData.name
        if (token.isNullOrBlank() || courierId.isNullOrBlank() || courierName.isNullOrBlank()) {
            _uiState.update {
                it.copy(isLoading = false, error = "Login gagal: data sesi kosong dari server")
            }
            return
        }

        authSessionManager.saveSession(
            authToken = token,
            courierId = courierId,
            courierName = courierName
        )
        _uiState.update { it.copy(isLoading = false, isLoggedIn = true, requiresOtp = false) }
    }

    private fun extractErrorMessage(response: Response<*>): String? {
        val rawErrorBody = response.errorBody()?.string()?.trim().orEmpty()
        if (rawErrorBody.isBlank()) return null

        return runCatching {
            val errorObject = errorJson.parseToJsonElement(rawErrorBody).jsonObject
            errorObject["message"]?.jsonPrimitive?.contentOrNull
                ?: errorObject["error"]?.jsonPrimitive?.contentOrNull
        }.getOrNull()
            ?: rawErrorBody.takeIf { it.length <= 180 }
    }
}
