package com.tembus.customer.ui.screens.service

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.customer.data.repository.OrderRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ServiceTrackingUiState(
    val isLoading: Boolean = false,
    val currentStepIndex: Int = 0,
    val courierName: String? = null,
    val statusText: String? = null,
    val etaMinutes: Int? = null,
    val error: String? = null,
    val hasSnapshot: Boolean = false,
    val isStale: Boolean = false,
    val isTerminal: Boolean = false,
    val canViewReport: Boolean = false,
    val noSupply: Boolean = false
)

@HiltViewModel
class ServiceTrackingViewModel @Inject constructor(
    private val orderRepository: OrderRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(ServiceTrackingUiState())
    val uiState: StateFlow<ServiceTrackingUiState> = _uiState.asStateFlow()

    fun startTracking(orderId: String, serviceSubType: String = "") {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }

            orderRepository.getOrderTrackingDetail(orderId)
                .onSuccess { detail ->
                    val order = detail.order
                    val terminal = isRoadsideTerminalStatus(order.status)
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            error = null,
                            currentStepIndex = if (serviceSubType.startsWith("tambal_ban")) {
                                tambalBanStepIndex(order.status)
                            } else {
                                towingStepIndex(order.status)
                            },
                            courierName = order.courierName,
                            statusText = if (serviceSubType.startsWith("tambal_ban")) {
                                tambalBanStatusText(order.status)
                            } else {
                                towingStatusText(order.status)
                            },
                            etaMinutes = order.etaMinutes,
                            hasSnapshot = true,
                            isStale = false,
                            isTerminal = terminal,
                            canViewReport = terminal,
                            noSupply = isRoadsideNoSupplyStatus(order.status)
                        )
                    }
                }
                .onFailure { e ->
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            isStale = it.hasSnapshot,
                            error = e.message ?: "Status terbaru belum dapat dimuat. Tarik untuk mencoba lagi."
                        )
                    }
                }
        }
    }
    
}
