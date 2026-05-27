package com.tembus.customer.ui.screens.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.customer.data.model.ProfileResponse
import com.tembus.customer.data.model.UpdateProfileRequest
import com.tembus.customer.data.repository.ProfileRepository
import com.tembus.customer.data.session.AuthSessionManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed class ProfileUiState {
    object Idle : ProfileUiState()
    object Loading : ProfileUiState()
    data class Success(
        val profile: ProfileResponse,
        val isUpdating: Boolean = false,
        val message: String? = null,
        val error: String? = null
    ) : ProfileUiState()
    data class Error(val message: String) : ProfileUiState()
}

@HiltViewModel
class ProfileViewModel @Inject constructor(
    private val repository: ProfileRepository,
    private val sessionManager: AuthSessionManager
) : ViewModel() {

    private val _uiState = MutableStateFlow<ProfileUiState>(ProfileUiState.Idle)
    val uiState: StateFlow<ProfileUiState> = _uiState.asStateFlow()

    init {
        fetchProfile()
    }

    fun fetchProfile() {
        viewModelScope.launch {
            _uiState.value = ProfileUiState.Loading
            repository.getProfile().collectLatest { result ->
                result.onSuccess { profile ->
                    _uiState.value = ProfileUiState.Success(profile)
                    sessionManager.updateCustomerName(profile.name)
                }
                result.onFailure { error ->
                    _uiState.value = ProfileUiState.Error(error.localizedMessage ?: "Gagal memuat profil")
                }
            }
        }
    }

    fun updateProfile(name: String, phoneNumber: String) {
        val currentState = _uiState.value as? ProfileUiState.Success ?: return
        val trimmedName = name.trim().replace(Regex("\\s+"), " ")
        val trimmedPhone = phoneNumber.trim()

        if (trimmedName.length !in 2..120) {
            _uiState.value = currentState.copy(error = "Nama harus 2-120 karakter.")
            return
        }

        viewModelScope.launch {
            _uiState.value = currentState.copy(isUpdating = true, message = null, error = null)
            repository.updateProfile(
                UpdateProfileRequest(
                    name = trimmedName,
                    phoneNumber = trimmedPhone
                )
            ).collectLatest { result ->
                result.onSuccess { profile ->
                    sessionManager.updateCustomerName(profile.name)
                    _uiState.value = ProfileUiState.Success(
                        profile = profile,
                        message = "Profil berhasil diperbarui."
                    )
                }
                result.onFailure { error ->
                    _uiState.value = currentState.copy(
                        isUpdating = false,
                        error = error.localizedMessage ?: "Gagal memperbarui profil."
                    )
                }
            }
        }
    }

    fun consumeProfileNotice() {
        val currentState = _uiState.value as? ProfileUiState.Success ?: return
        _uiState.value = currentState.copy(message = null, error = null)
    }

    fun logout(onLoggedOut: () -> Unit) {
        viewModelScope.launch {
            sessionManager.clearSession()
            onLoggedOut()
        }
    }
}
