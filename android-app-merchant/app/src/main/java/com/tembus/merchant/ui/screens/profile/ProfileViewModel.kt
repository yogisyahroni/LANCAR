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
import java.time.Instant

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
    val isSavingPayment: Boolean = false,
    val paymentSaved: Boolean = false,
    val paymentSaveError: String? = null,
    val isSavingProfile: Boolean = false,
    val profileSaved: Boolean = false,
    val profileSaveError: String? = null,
    // FB-109: status update minimal order.
    val isSavingMinOrder: Boolean = false,
    val minOrderSaveError: String? = null,
    // Operational controls on the profile hub stay server-authoritative.
    val isSavingOperational: Boolean = false,
    val operationalError: String? = null
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

    fun updatePaymentSettings(payoutSchedule: String, npwp: String?) {
        _uiState.value = _uiState.value.copy(isSavingPayment = true, paymentSaved = false, paymentSaveError = null)
        viewModelScope.launch {
            merchantRepository.updateProfile(
                UpdateProfileRequest(payoutSchedule = payoutSchedule, npwp = npwp)
            ).onSuccess { updated ->
                _uiState.value = _uiState.value.copy(
                    merchant = updated,
                    isSavingPayment = false,
                    paymentSaved = true
                )
            }.onFailure { e ->
                _uiState.value = _uiState.value.copy(
                    isSavingPayment = false,
                    paymentSaveError = e.message ?: "Gagal menyimpan pengaturan pembayaran"
                )
            }
        }
    }

    fun clearPaymentSaved() {
        _uiState.value = _uiState.value.copy(paymentSaved = false, paymentSaveError = null)
    }

    suspend fun uploadProfileImage(file: java.io.File): Result<String> =
        merchantRepository.uploadPhoto(file)

    fun updatePublicProfile(
        name: String,
        address: String,
        outletName: String,
        shortDescription: String,
        primaryCategories: List<String>,
        bannerUrl: String,
        logoUrl: String
    ) {
        _uiState.value = _uiState.value.copy(isSavingProfile = true, profileSaved = false, profileSaveError = null)
        viewModelScope.launch {
            merchantRepository.updateProfile(
                UpdateProfileRequest(
                    namaToko = name.trim(),
                    alamat = address.trim(),
                    outletName = outletName.trim(),
                    shortDescription = shortDescription.trim(),
                    primaryCategories = primaryCategories,
                    bannerUrl = bannerUrl.trim(),
                    logoUrl = logoUrl.trim()
                )
            ).onSuccess { updated ->
                _uiState.value = _uiState.value.copy(
                    merchant = updated,
                    isSavingProfile = false,
                    profileSaved = true
                )
            }.onFailure { e ->
                _uiState.value = _uiState.value.copy(
                    isSavingProfile = false,
                    profileSaveError = e.message ?: "Gagal menyimpan profil publik"
                )
            }
        }
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

    fun toggleOpen() {
        val current = _uiState.value.merchant?.isOpen ?: return
        _uiState.value = _uiState.value.copy(isSavingOperational = true, operationalError = null)
        viewModelScope.launch {
            merchantRepository.toggleOpen(!current)
                .onSuccess { updated ->
                    _uiState.value = _uiState.value.copy(
                        merchant = updated,
                        isSavingOperational = false
                    )
                }
                .onFailure { e ->
                    _uiState.value = _uiState.value.copy(
                        isSavingOperational = false,
                        operationalError = e.message ?: "Gagal mengubah status toko"
                    )
                }
        }
    }

    fun setAutoAcceptOrders(enabled: Boolean) {
        _uiState.value = _uiState.value.copy(isSavingOperational = true, operationalError = null)
        viewModelScope.launch {
            merchantRepository.setAutoAcceptOrders(enabled)
                .onSuccess { updated ->
                    _uiState.value = _uiState.value.copy(
                        merchant = updated,
                        isSavingOperational = false
                    )
                }
                .onFailure { e ->
                    _uiState.value = _uiState.value.copy(
                        isSavingOperational = false,
                        operationalError = e.message ?: "Gagal mengubah penerimaan otomatis"
                    )
                }
        }
    }

    fun setBusy(durationMinutes: Int, extraPrepMinutes: Int = 15) {
        _uiState.value = _uiState.value.copy(isSavingOperational = true, operationalError = null)
        viewModelScope.launch {
            val until = Instant.now().plusSeconds(durationMinutes * 60L).toString()
            merchantRepository.busy(until, extraPrepMinutes)
                .onSuccess { updated ->
                    _uiState.value = _uiState.value.copy(
                        merchant = updated,
                        isSavingOperational = false
                    )
                }
                .onFailure { e ->
                    _uiState.value = _uiState.value.copy(
                        isSavingOperational = false,
                        operationalError = e.message ?: "Gagal mengaktifkan mode sibuk"
                    )
                }
        }
    }

    fun clearBusy() {
        _uiState.value = _uiState.value.copy(isSavingOperational = true, operationalError = null)
        viewModelScope.launch {
            merchantRepository.resume()
                .onSuccess { updated ->
                    _uiState.value = _uiState.value.copy(
                        merchant = updated,
                        isSavingOperational = false
                    )
                }
                .onFailure { e ->
                    _uiState.value = _uiState.value.copy(
                        isSavingOperational = false,
                        operationalError = e.message ?: "Gagal menonaktifkan mode sibuk"
                    )
                }
        }
    }

    fun clearOperationalError() {
        _uiState.value = _uiState.value.copy(operationalError = null)
    }

    fun clearError() {
        _uiState.value = _uiState.value.copy(errorMessage = null)
    }
}
