package com.tembus.customer.ui.screens.service

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.customer.data.repository.OrderRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ServiceTrackingUiState(
    val isLoading: Boolean = false,
    val currentStepIndex: Int = 0,
    val courierName: String? = null,
    val courierPhotoUrl: String? = null,
    val courierVehicle: String? = null,
    val courierPlate: String? = null,
    val orderNumber: String? = null,
    val pickupAddress: String? = null,
    val dropoffAddress: String? = null,
    val totalPriceIdr: Long? = null,
    val paymentStatus: String? = null,
    val paymentMethod: String? = null,
    val routeDistanceMeters: Int? = null,
    val routeDurationSeconds: Int? = null,
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

    private var trackingJob: Job? = null

    fun startTracking(orderId: String, serviceSubType: String = "") {
        trackingJob?.cancel()
        trackingJob = viewModelScope.launch {
            while (isActive) {
                loadTrackingSnapshot(orderId, serviceSubType)
                if (_uiState.value.isTerminal) break
                delay(if (_uiState.value.hasSnapshot) 5_000L else 1_000L)
            }
        }
    }

    private suspend fun loadTrackingSnapshot(orderId: String, serviceSubType: String) {
            _uiState.update { it.copy(isLoading = true, error = null) }

            orderRepository.getOrderTrackingDetail(orderId)
                .onSuccess { detail ->
                    val order = detail.order
                    val tracking = detail.tracking
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
                            courierPhotoUrl = order.courierPhotoUrl,
                            courierVehicle = order.courierVehicle,
                            courierPlate = order.courierPlate,
                            orderNumber = order.orderNumber ?: order.id,
                            pickupAddress = order.pickupAddress,
                            dropoffAddress = order.dropoffAddress,
                            totalPriceIdr = order.invoice?.amountIdr?.takeIf { amount -> amount > 0 } ?: order.totalPriceIdr,
                            paymentStatus = order.invoice?.paymentStatus,
                            paymentMethod = order.invoice?.paymentMethod,
                            routeDistanceMeters = tracking?.orderRouteDistanceMeters
                                ?: order.routeDistanceMeters
                                ?: order.routeSnapshot?.distanceMeters,
                            routeDurationSeconds = tracking?.orderRouteDurationSeconds
                                ?: order.routeDurationSeconds
                                ?: order.routeSnapshot?.durationSeconds?.toInt(),
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

    override fun onCleared() {
        trackingJob?.cancel()
        super.onCleared()
    }
}
