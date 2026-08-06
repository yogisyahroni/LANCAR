package com.tembus.merchant.ui.screens.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.merchant.data.model.Merchant
import com.tembus.merchant.data.repository.AuthRepository
import com.tembus.merchant.data.repository.MerchantRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class ProfileUiState(
    val merchant: Merchant? = null,
    val email: String? = null,
    val name: String? = null,
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val needsRegistration: Boolean = false
)

class ProfileViewModel(
    private val merchantRepository: MerchantRepository,
    private val authRepository: AuthRepository,
    private val sessionManager: com.tembus.merchant.data.session.AuthSessionManager
) : ViewModel() {

    private val _uiState = MutableStateFlow(ProfileUiState())
    val uiState: StateFlow<ProfileUiState> = _uiState.asStateFlow()

    init {
        load()
        viewModelScope.launch {
            sessionManager.userName.collect { name ->
                _uiState.value = _uiState.value.copy(name = name)
            }
        }
        viewModelScope.launch {
            sessionManager.userEmail.collect { email ->
                _uiState.value = _uiState.value.copy(email = email)
            }
        }
    }

    fun load() {
        _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)
        viewModelScope.launch {
            merchantRepository.getProfile()
                .onSuccess { profile ->
                    _uiState.value = _uiState.value.copy(
                        merchant = profile,
                        needsRegistration = false,
                        isLoading = false
                    )
                }
                .onFailure { e ->
                    if (e.message?.contains("belum terdaftar") == true || e.message?.contains("404") == true) {
                        _uiState.value = _uiState.value.copy(
                            needsRegistration = true,
                            isLoading = false
                        )
                    } else {
                        _uiState.value = _uiState.value.copy(
                            errorMessage = e.message ?: "Gagal memuat profil",
                            isLoading = false
                        )
                    }
                }
        }
    }

    fun logout() {
        authRepository.logout()
    }

    fun clearError() {
        _uiState.value = _uiState.value.copy(errorMessage = null)
    }
}
