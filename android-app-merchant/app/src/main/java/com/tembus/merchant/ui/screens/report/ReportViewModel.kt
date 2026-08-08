package com.tembus.merchant.ui.screens.report

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.merchant.data.model.SalesReportSummary
import com.tembus.merchant.data.repository.MerchantRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

enum class ReportPeriod(val label: String, val apiValue: String) {
    DAILY("Hari Ini", "daily"),
    WEEKLY("7 Hari", "weekly")
}

data class ReportUiState(
    val period: ReportPeriod = ReportPeriod.DAILY,
    val report: SalesReportSummary? = null,
    val isLoading: Boolean = false,
    val errorMessage: String? = null
)

/**
 * ReportViewModel — laporan penjualan merchant (FB-086):
 * pendapatan bersih, item terlaris, ringkasan; toggle harian/mingguan.
 */
class ReportViewModel(
    private val merchantRepository: MerchantRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(ReportUiState())
    val uiState: StateFlow<ReportUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun selectPeriod(period: ReportPeriod) {
        if (period == _uiState.value.period) return
        _uiState.value = _uiState.value.copy(period = period)
        load()
    }

    fun load() {
        val period = _uiState.value.period
        _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)
        viewModelScope.launch {
            merchantRepository.getSalesReport(period.apiValue)
                .onSuccess { report ->
                    _uiState.value = _uiState.value.copy(
                        report = report,
                        isLoading = false
                    )
                }
                .onFailure { e ->
                    _uiState.value = _uiState.value.copy(
                        errorMessage = e.message ?: "Gagal memuat laporan",
                        isLoading = false
                    )
                }
        }
    }
}
