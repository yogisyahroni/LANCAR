package com.tembus.merchant.ui.screens.settlement

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.merchant.data.model.Merchant
import com.tembus.merchant.data.model.MerchantWithdrawalRecord
import com.tembus.merchant.data.model.MerchantWithdrawalRequest
import com.tembus.merchant.data.model.SettlementSummary
import com.tembus.merchant.data.repository.MerchantRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.util.UUID

data class SettlementUiState(
    val summary: SettlementSummary? = null,
    val withdrawals: List<MerchantWithdrawalRecord> = emptyList(),
    val merchant: com.tembus.merchant.data.model.Merchant? = null,
    val isLoading: Boolean = false,
    val isRequesting: Boolean = false,
    val errorMessage: String? = null,
    val requestError: String? = null,
    val requestSuccess: Boolean = false
)

/**
 * SettlementViewModel — riwayat pencairan/payout merchant (FB-113).
 * Data dari GET /api/v1/merchant/settlements (backend cron 5 menit):
 * total sudah cair, total ditahan, + daftar settlement terbaru.
 */
class SettlementViewModel(
    private val merchantRepository: MerchantRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(SettlementUiState())
    val uiState: StateFlow<SettlementUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun load() {
        _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)
        viewModelScope.launch {
            merchantRepository.getProfile()
                .onSuccess { m -> _uiState.value = _uiState.value.copy(merchant = m) }
                .onFailure { /* bank info optional di dialog */ }
            merchantRepository.getSettlements()
                .onSuccess { summary ->
                    _uiState.value = _uiState.value.copy(summary = summary, isLoading = false)
                    loadWithdrawals()
                }
                .onFailure { e ->
                    _uiState.value = _uiState.value.copy(
                        errorMessage = e.message ?: "Gagal memuat riwayat pencairan",
                        isLoading = false
                    )
                }
        }
    }

    // M7: muat riwayat permintaan pencairan.
    fun loadWithdrawals() {
        viewModelScope.launch {
            merchantRepository.getWithdrawals()
                .onSuccess { list -> _uiState.value = _uiState.value.copy(withdrawals = list) }
                .onFailure { /* silent — tidak blokir summary */ }
        }
    }

    // M7: ajukan pencairan saldo.
    fun requestWithdrawal(amountIdr: Long, bankName: String, accountNumber: String, holder: String) {
        _uiState.value = _uiState.value.copy(isRequesting = true, requestError = null, requestSuccess = false)
        viewModelScope.launch {
            val req = MerchantWithdrawalRequest(
                amountIdr = amountIdr,
                bankName = bankName,
                bankAccountNumber = accountNumber,
                bankAccountHolder = holder,
                idempotencyKey = UUID.randomUUID().toString()
            )
            merchantRepository.requestWithdrawal(req)
                .onSuccess { available ->
                    _uiState.value = _uiState.value.copy(
                        isRequesting = false,
                        requestSuccess = true,
                        // refresh summary agar saldo tersedia turun
                        summary = _uiState.value.summary?.copy(availableIdr = available)
                    )
                    loadWithdrawals()
                }
                .onFailure { e ->
                    _uiState.value = _uiState.value.copy(
                        isRequesting = false,
                        requestError = e.message ?: "Gagal mengajukan pencairan"
                    )
                }
        }
    }

    fun clearRequestState() {
        _uiState.value = _uiState.value.copy(requestSuccess = false, requestError = null)
    }
}
