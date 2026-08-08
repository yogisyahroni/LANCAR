package com.tembus.merchant.ui.screens.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.merchant.data.model.Merchant
import com.tembus.merchant.data.model.MerchantOrder
import com.tembus.merchant.data.model.SalesReportSummary
import com.tembus.merchant.data.repository.MerchantRepository
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class DashboardUiState(
    val merchant: Merchant? = null,
    val report: SalesReportSummary? = null,
    val recentOrders: List<MerchantOrder> = emptyList(),
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val needsRegistration: Boolean = false
)

/**
 * DashboardViewModel — data untuk tab Dashboard (design merchant 2026):
 * profil merchant + laporan harian (GMV, total pesanan) + pesanan terbaru.
 */
class DashboardViewModel(
    private val merchantRepository: MerchantRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(DashboardUiState())
    val uiState: StateFlow<DashboardUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun load() {
        _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)
        viewModelScope.launch {
            merchantRepository.getProfile()
                .onSuccess { profile ->
                    if (profile.id.isBlank()) {
                        _uiState.value = _uiState.value.copy(
                            needsRegistration = true,
                            isLoading = false
                        )
                        return@onSuccess
                    }
                    _uiState.value = _uiState.value.copy(
                        merchant = profile,
                        needsRegistration = false
                    )
                    loadReports(profile.id)
                }
                .onFailure { e ->
                    if (e.message?.contains("belum terdaftar") == true || e.message?.contains("404") == true) {
                        _uiState.value = _uiState.value.copy(
                            needsRegistration = true,
                            isLoading = false
                        )
                    } else {
                        _uiState.value = _uiState.value.copy(
                            errorMessage = e.message ?: "Gagal memuat dashboard",
                            isLoading = false
                        )
                    }
                }
        }
    }

    private fun loadReports(merchantId: String) {
        viewModelScope.launch {
            // Laporan harian + pesanan terbaru paralel
            val reportDeferred = async {
                merchantRepository.getSalesReport("daily").getOrNull()
            }
            val ordersDeferred = async {
                merchantRepository.listOrders(page = 1, pageSize = 5).getOrNull().orEmpty()
            }
            val report = reportDeferred.await()
            val orders = ordersDeferred.await()
            _uiState.value = _uiState.value.copy(
                report = report,
                recentOrders = orders,
                isLoading = false
            )
        }
    }
}
