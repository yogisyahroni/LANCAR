package com.tembus.merchant.ui.screens.settlement

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.merchant.data.model.SettlementSummary
import com.tembus.merchant.data.repository.MerchantRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class SettlementUiState(
    val summary: SettlementSummary? = null,
    val isLoading: Boolean = false,
    val errorMessage: String? = null
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
            merchantRepository.getSettlements()
                .onSuccess { summary ->
                    _uiState.value = _uiState.value.copy(summary = summary, isLoading = false)
                }
                .onFailure { e ->
                    _uiState.value = _uiState.value.copy(
                        errorMessage = e.message ?: "Gagal memuat riwayat pencairan",
                        isLoading = false
                    )
                }
        }
    }
}
