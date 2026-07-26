package com.tembus.customer.ui.screens.service

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.customer.data.repository.OrderRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ServiceTrackingUiState(
    val isLoading: Boolean = false,
    val currentStepIndex: Int = 0,
    val courierName: String? = null,
    val statusText: String? = null,
    val etaMinutes: Int? = null,
    val error: String? = null
)

@HiltViewModel
class ServiceTrackingViewModel @Inject constructor(
    private val orderRepository: OrderRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(ServiceTrackingUiState())
    val uiState: StateFlow<ServiceTrackingUiState> = _uiState.asStateFlow()

    fun startTracking(orderId: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            
            orderRepository.getOrderDetail(orderId)
                .collect { result ->
                    result.onSuccess { order ->
                        _uiState.update {
                            it.copy(
                                isLoading = false,
                                currentStepIndex = calculateStepIndex(order.status),
                                courierName = order.courierName,
                                statusText = getStatusText(order.status),
                                etaMinutes = order.etaMinutes
                            )
                        }
                    }
                    result.onFailure { e ->
                        _uiState.update {
                            it.copy(
                                isLoading = false,
                                error = e.message ?: "Gagal memuat data"
                            )
                        }
                    }
                }
        }
    }
    
    private fun calculateStepIndex(status: String): Int {
        return when (status.lowercase()) {
            "navigating", "picking_up" -> 0
            "arrived_pickup", "arrived" -> 1
            "verifying" -> 2
            "inspecting" -> 3
            "loading", "in_progress" -> 4
            "in_transit", "delivering" -> 5
            "arrived_dropoff" -> 6
            "completed", "delivered" -> 7
            else -> 0
        }
    }
    
    private fun getStatusText(status: String): String {
        return when (status.lowercase()) {
            "navigating", "picking_up" -> "Sedang dalam perjalanan ke lokasi Anda"
            "arrived_pickup", "arrived" -> "Sudah tiba di lokasi Anda"
            "verifying" -> "Sedang melakukan verifikasi"
            "inspecting" -> "Sedang melakukan inspeksi"
            "loading", "in_progress" -> "Sedang mengerjakan layanan"
            "in_transit", "delivering" -> "Sedang dalam perjalanan ke tujuan"
            "arrived_dropoff" -> "Sudah tiba di lokasi tujuan"
            "completed", "delivered" -> "Layanan telah selesai"
            else -> "Memproses..."
        }
    }
}
