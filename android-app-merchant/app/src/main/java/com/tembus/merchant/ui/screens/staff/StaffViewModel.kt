package com.tembus.merchant.ui.screens.staff

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.merchant.data.model.InviteStaffRequest
import com.tembus.merchant.data.model.MerchantStaff
import com.tembus.merchant.data.model.UpdateStaffRequest
import com.tembus.merchant.data.repository.MerchantRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class StaffUiState(
    val items: List<MerchantStaff> = emptyList(),
    val isLoading: Boolean = false,
    val actionLoadingId: String? = null,
    val errorMessage: String? = null,
    // M1: owner bisa kelola staff (manager dengan PermManageStaff juga, tapi di app
    // kita asumsikan owner/manager yang buka tab ini). canManage = true untuk owner.
    val canManage: Boolean = true
)

/**
 * StaffViewModel — kelola staff toko (M1, CORPORATE ONLY).
 * List/invite/role/revoke. Semua guard (corporate-only, scope merchant) ada di backend.
 */
class StaffViewModel(
    private val merchantRepository: MerchantRepository,
    private val merchantId: String
) : ViewModel() {

    private val _uiState = MutableStateFlow(StaffUiState())
    val uiState: StateFlow<StaffUiState> = _uiState.asStateFlow()

    init { load() }

    fun load() {
        _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)
        viewModelScope.launch {
            merchantRepository.listStaff(merchantId)
                .onSuccess { items ->
                    _uiState.value = _uiState.value.copy(items = items, isLoading = false)
                }
                .onFailure { e ->
                    _uiState.value = _uiState.value.copy(
                        errorMessage = e.message ?: "Gagal memuat staff",
                        isLoading = false
                    )
                }
        }
    }

    fun invite(email: String?, phone: String?, role: String) {
        if (email.isNullOrBlank() && phone.isNullOrBlank()) {
            _uiState.value = _uiState.value.copy(errorMessage = "Email atau nomor wajib diisi")
            return
        }
        _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)
        viewModelScope.launch {
            merchantRepository.inviteStaff(
                merchantId,
                InviteStaffRequest(email = email?.trim()?.ifBlank { null }, phone = phone?.trim()?.ifBlank { null }, role = role)
            ).onSuccess {
                _uiState.value = _uiState.value.copy(isLoading = false)
                load()
            }.onFailure { e ->
                _uiState.value = _uiState.value.copy(
                    errorMessage = e.message ?: "Gagal mengundang staff",
                    isLoading = false
                )
            }
        }
    }

    fun updateRole(staffId: String, role: String) {
        _uiState.value = _uiState.value.copy(actionLoadingId = staffId, errorMessage = null)
        viewModelScope.launch {
            merchantRepository.updateStaff(merchantId, staffId, UpdateStaffRequest(role = role))
                .onSuccess { load() }
                .onFailure { e ->
                    _uiState.value = _uiState.value.copy(
                        actionLoadingId = null,
                        errorMessage = e.message ?: "Gagal ubah role staff"
                    )
                }
        }
    }

    fun revoke(staffId: String) {
        _uiState.value = _uiState.value.copy(actionLoadingId = staffId, errorMessage = null)
        viewModelScope.launch {
            merchantRepository.updateStaff(merchantId, staffId, UpdateStaffRequest(status = "revoked"))
                .onSuccess { load() }
                .onFailure { e ->
                    _uiState.value = _uiState.value.copy(
                        actionLoadingId = null,
                        errorMessage = e.message ?: "Gagal cabut akses staff"
                    )
                }
        }
    }

    fun clearError() {
        _uiState.value = _uiState.value.copy(errorMessage = null)
    }
}
