package com.lancar.customer.ui.screens.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.firebase.messaging.FirebaseMessaging
import com.lancar.customer.data.model.UpdateProfileRequest
import com.lancar.customer.data.repository.AuthRepository
import com.lancar.customer.data.repository.NotificationRepository
import com.lancar.customer.data.repository.ProfileRepository
import com.lancar.customer.data.session.AuthSessionManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject
import com.lancar.customer.config.AppConfig

sealed class AuthState {
    object Idle : AuthState()
    object Loading : AuthState()
    object OtpSent : AuthState()
    data class Success(val isNewUser: Boolean = false) : AuthState()
    object ProfileCompleted : AuthState()
    data class Error(val message: String) : AuthState()
}

@HiltViewModel
class AuthViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val sessionManager: AuthSessionManager,
    private val notificationRepository: NotificationRepository,
    private val profileRepository: ProfileRepository
) : ViewModel() {

    private val _authState = MutableStateFlow<AuthState>(AuthState.Idle)
    val authState: StateFlow<AuthState> = _authState.asStateFlow()

    private val _phoneNumber = MutableStateFlow("")
    val phoneNumber: StateFlow<String> = _phoneNumber.asStateFlow()

    private val _password = MutableStateFlow("")
    val password: StateFlow<String> = _password.asStateFlow()

    private val _pendingRegistrationName = MutableStateFlow("")
    val pendingRegistrationName: StateFlow<String> = _pendingRegistrationName.asStateFlow()

    private val _pendingRegistrationPhone = MutableStateFlow("")

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
                _authState.value = AuthState.Error(exception.localizedMessage ?: "Gagal mengirim OTP")
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
                .onSuccess { _authState.value = AuthState.OtpSent }
                .onFailure { exception ->
                    _authState.value = AuthState.Error(exception.localizedMessage ?: "Email atau password tidak sesuai")
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
                    _authState.value = AuthState.Error(exception.localizedMessage ?: "Pendaftaran gagal diproses")
                }
        }
    }

    fun verifyOtp(code: String) {
        val phone = _phoneNumber.value
        viewModelScope.launch {
            _authState.value = AuthState.Loading
            val result = authRepository.verifyOtp(phone, code)
            
            result.onSuccess { response ->
                val data = response.data
                val token = data?.token ?: response.accessToken
                val customerId = data?.customerId ?: response.user?.id
                val customerName = data?.name ?: response.user?.fullName ?: response.user?.name
                if (!token.isNullOrBlank() && !customerId.isNullOrBlank()) {
                    // Save authentication data securely
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
                    _authState.value = AuthState.Error("Data autentikasi kosong")
                }
            }.onFailure { exception ->
                _authState.value = AuthState.Error(exception.localizedMessage ?: "Kode OTP salah")
            }
        }
    }

    fun resetState() {
        _authState.value = AuthState.Idle
    }

    fun completeProfile(fullName: String) {
        val cleanName = fullName.trim()
        if (cleanName.length < 2) {
            _authState.value = AuthState.Error("Nama lengkap minimal 2 karakter")
            return
        }

        viewModelScope.launch {
            _authState.value = AuthState.Loading
            profileRepository.updateProfile(
                UpdateProfileRequest(
                    name = cleanName,
                    phoneNumber = _pendingRegistrationPhone.value.ifBlank { _phoneNumber.value }
                )
            ).collect { result ->
                result.onSuccess { profile ->
                    sessionManager.saveUserData(sessionManager.getTokenOnce() ?: "", profile.name)
                    _authState.value = AuthState.ProfileCompleted
                }.onFailure { exception ->
                    _authState.value = AuthState.Error(exception.localizedMessage ?: "Gagal melengkapi profil")
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
}
