package com.tembus.merchant.ui.screens.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.merchant.data.model.MerchantOrder
import com.tembus.merchant.data.repository.MerchantRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class OrderHistoryUiState(
    val isLoading: Boolean = true,
    val orders: List<MerchantOrder> = emptyList(),
    val selectedStatus: String? = null,
    val errorMessage: String? = null,
    val totalCount: Int = 0,
    val completedCount: Int = 0,
    val cancelledCount: Int = 0,
    val rejectedCount: Int = 0
)

class OrderHistoryViewModel(private val repository: MerchantRepository) : ViewModel() {
    private val _uiState = MutableStateFlow(OrderHistoryUiState())
    val uiState: StateFlow<OrderHistoryUiState> = _uiState.asStateFlow()

    init { load() }

    fun selectStatus(status: String?) {
        _uiState.value = _uiState.value.copy(selectedStatus = status)
        load()
    }

    fun load() {
        viewModelScope.launch {
            val filter = _uiState.value.selectedStatus
            _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)
            // Riwayat memakai terminal order dari backend. Reject merchant tetap
            // dibedakan dari cancel customer lewat reject_reason.
            repository.listOrders(status = null, pageSize = 100)
                .onSuccess { orders ->
                    val history = orders.filter { it.isHistoryOrder() }
                    val filtered = when (filter) {
                        "rejected" -> history.filter { it.isMerchantRejected() }
                        "cancelled" -> history.filter { it.status == "cancelled" && !it.isMerchantRejected() }
                        "delivered" -> history.filter { it.status == "delivered" }
                        else -> history
                    }
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        orders = filtered,
                        totalCount = history.size,
                        completedCount = history.count { it.status == "delivered" },
                        cancelledCount = history.count { it.status == "cancelled" && !it.isMerchantRejected() },
                        rejectedCount = history.count { it.isMerchantRejected() }
                    )
                }
                .onFailure { error ->
                    _uiState.value = _uiState.value.copy(isLoading = false, errorMessage = error.message ?: "Gagal memuat riwayat")
                }
        }
    }
}

private fun MerchantOrder.isMerchantRejected(): Boolean =
    status == "cancelled_by_merchant" || !rejectReason.isNullOrBlank()

private fun MerchantOrder.isHistoryOrder(): Boolean =
    status == "delivered" || status == "cancelled" || status == "cancelled_by_merchant" || !rejectReason.isNullOrBlank()
