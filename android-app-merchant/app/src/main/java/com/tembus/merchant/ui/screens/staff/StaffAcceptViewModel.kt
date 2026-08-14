package com.tembus.merchant.ui.screens.staff

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.merchant.data.repository.MerchantRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class StaffAcceptUiState(
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val success: Boolean = false,
    val message: String = ""
)

/**
 * StaffAcceptViewModel — staff accept invite via token.
 * Dipakai StaffAcceptScreen (manual input) + nanti deep link.
 */
class StaffAcceptViewModel(
    private val merchantRepository: MerchantRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(StaffAcceptUiState())
    val uiState: StateFlow<StaffAcceptUiState> = _uiState.asStateFlow()

    fun accept(token: String) {
        if (token.trim().isEmpty()) {
            _uiState.value = _uiState.value.copy(errorMessage = "Token undangan wajib diisi")
            return
        }
        _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null, success = false)
        viewModelScope.launch {
            merchantRepository.acceptStaffInvite(token.trim())
                .onSuccess {
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        success = true,
                        message = "Undangan diterima! Sekarang kamu staff toko ini."
                    )
                }
                .onFailure { e ->
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        errorMessage = e.message ?: "Gagal menerima undangan (token invalid/expired?)"
                    )
                }
        }
    }

    fun clear() {
        _uiState.value = StaffAcceptUiState()
    }
}