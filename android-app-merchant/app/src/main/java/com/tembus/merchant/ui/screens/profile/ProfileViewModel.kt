package com.tembus.merchant.ui.screens.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.merchant.data.model.Merchant
import com.tembus.merchant.data.model.UpdateBankAccountRequest
import com.tembus.merchant.data.model.UpdateProfileRequest
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
    val needsRegistration: Boolean = false,
    // FB-114: status form update rekening bank.
    val isSavingBank: Boolean = false,
    val bankSaved: Boolean = false,
    val bankSaveError: String? = null,
    // FB-109: status update minimal order.
    val isSavingMinOrder: Boolean = false,
    val minOrderSaveError: String? = null
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

    // FB-114: simpan rekening bank baru.
    fun updateBankAccount(req: UpdateBankAccountRequest) {
        _uiState.value = _uiState.value.copy(isSavingBank = true, bankSaved = false, bankSaveError = null)
        viewModelScope.launch {
            merchantRepository.updateBankAccount(req)
                .onSuccess { updated ->
                    _uiState.value = _uiState.value.copy(
                        merchant = updated,
                        isSavingBank = false,
                        bankSaved = true
                    )
                }
                .onFailure { e ->
                    _uiState.value = _uiState.value.copy(
                        isSavingBank = false,
                        bankSaveError = e.message ?: "Gagal menyimpan rekening"
                    )
                }
        }
    }

    fun clearBankSaved() {
        _uiState.value = _uiState.value.copy(bankSaved = false, bankSaveError = null)
    }

    // FB-109: update minimal order value (0 = tanpa minimum).
    fun updateMinOrder(minOrderIdr: Long) {
        _uiState.value = _uiState.value.copy(isSavingMinOrder = true, minOrderSaveError = null)
        viewModelScope.launch {
            merchantRepository.updateProfile(UpdateProfileRequest(minOrderIdr = minOrderIdr))
                .onSuccess { updated ->
                    _uiState.value = _uiState.value.copy(
                        merchant = updated,
                        isSavingMinOrder = false
                    )
                }
                .onFailure { e ->
                    _uiState.value = _uiState.value.copy(
                        isSavingMinOrder = false,
                        minOrderSaveError = e.message ?: "Gagal menyimpan minimal order"
                    )
                }
        }
    }

    // M5: update jam operasional (buka/tutup)
    fun updateOperatingHours(jamBuka: String, jamTutup: String) {
        _uiState.value = _uiState.value.copy(isSavingMinOrder = true, minOrderSaveError = null)
        viewModelScope.launch {
            merchantRepository.updateProfile(UpdateProfileRequest(jamBuka = jamBuka, jamTutup = jamTutup))
                .onSuccess { updated ->
                    _uiState.value = _uiState.value.copy(
                        merchant = updated,
                        isSavingMinOrder = false
                    )
                }
                .onFailure { e ->
                    _uiState.value = _uiState.value.copy(
                        isSavingMinOrder = false,
                        minOrderSaveError = e.message ?: "Gagal menyimpan jam operasional"
                    )
                }
        }
    }

    fun clearError() {
        _uiState.value = _uiState.value.copy(errorMessage = null)
    }
}
