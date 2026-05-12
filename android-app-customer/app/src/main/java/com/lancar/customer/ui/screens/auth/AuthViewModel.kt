package com.lancar.customer.ui.screens.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.lancar.customer.data.repository.AuthRepository
import com.lancar.customer.data.session.AuthSessionManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject
import com.lancar.customer.config.AppConfig
import android.util.Patterns

sealed class AuthState {
    object Idle : AuthState()
    object Loading : AuthState()
    object OtpSent : AuthState()
    object Success : AuthState()
    data class Error(val message: String) : AuthState()
}

@HiltViewModel
class AuthViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val sessionManager: AuthSessionManager
) : ViewModel() {

    private val _authState = MutableStateFlow<AuthState>(AuthState.Idle)
    val authState: StateFlow<AuthState> = _authState.asStateFlow()

    private val _phoneNumber = MutableStateFlow("")
    val phoneNumber: StateFlow<String> = _phoneNumber.asStateFlow()

    fun setPhoneNumber(phone: String) {
        _phoneNumber.value = phone
    }

    fun requestOtp() {
        val phone = _phoneNumber.value
        val minLen = if (AppConfig.IS_EMAIL_AUTH_ENABLED) 5 else 9
        val isEmailMode = AppConfig.IS_EMAIL_AUTH_ENABLED
        
        val isValid = if (isEmailMode) {
            Patterns.EMAIL_ADDRESS.matcher(phone).matches()
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

    fun verifyOtp(code: String) {
        val phone = _phoneNumber.value
        viewModelScope.launch {
            _authState.value = AuthState.Loading
            val result = authRepository.verifyOtp(phone, code)
            
            result.onSuccess { response ->
                val data = response.data
                if (data != null) {
                    // Save authentication data securely
                    sessionManager.saveSession(
                        token = data.token,
                        id = data.customerId,
                        name = data.name
                    )
                    _authState.value = AuthState.Success
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
}
