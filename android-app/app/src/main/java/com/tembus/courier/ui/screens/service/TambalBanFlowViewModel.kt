package com.tembus.courier.ui.screens.service

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.courier.data.repository.OrderRepository
import com.tembus.courier.data.model.distanceKmValue
import com.tembus.courier.data.model.cleanPayoutIdr
import com.tembus.courier.domain.TambalBanFlowResolver
import com.tembus.courier.domain.TambalBanStage
import com.tembus.courier.domain.TambalBanNextActionType
import com.tembus.courier.ui.components.service.EarningsData
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class TambalBanFlowUiState(
    val isLoading: Boolean = false,
    val currentStepIndex: Int = 0,
    val title: String = "",
    val instruction: String = "",
    val isCompleted: Boolean = false,
    val nextActionLabel: String = "",
    val nextActionType: TambalBanNextActionType = TambalBanNextActionType.NONE,
    val earnings: EarningsData? = null,
    val error: String? = null
)

@HiltViewModel
class TambalBanFlowViewModel @Inject constructor(
    private val orderRepository: OrderRepository
) : ViewModel() {

    private var orderId: String = ""

    private val _uiState = MutableStateFlow(TambalBanFlowUiState())
    val uiState: StateFlow<TambalBanFlowUiState> = _uiState.asStateFlow()

    fun loadOrder(orderId: String) {
        this.orderId = orderId
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }

            try {
                val order = orderRepository.getOrderById(orderId)
                if (order != null) {
                    val flowState = TambalBanFlowResolver.resolve(order)
                    val distKm = order.distanceKmValue()
                    val payout = order.cleanPayoutIdr().toLong()

                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            currentStepIndex = flowState.currentStepIndex,
                            title = flowState.title,
                            instruction = flowState.instruction,
                            isCompleted = flowState.stage == TambalBanStage.COMPLETED,
                            nextActionLabel = flowState.nextAction.label,
                            nextActionType = flowState.nextAction.type,
                            earnings = EarningsData(
                                serviceFee = payout,
                                baseFee = 0,
                                perKmRate = if (distKm > 0) (payout / distKm.toLong()).coerceAtLeast(0) else 0,
                                distanceKm = distKm,
                                tollCost = 0,
                                platformCommissionPct = 20.0,
                                platformCommissionAmt = (payout * 20 / 100),
                                estimatedNetEarnings = payout - (payout * 20 / 100),
                                settlementModel = "per_km"
                            )
                        )
                    }
                } else {
                    _uiState.update {
                        it.copy(isLoading = false, error = "Order tidak ditemukan")
                    }
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(isLoading = false, error = e.message ?: "Gagal memuat data")
                }
            }
        }
    }

    fun handleNextAction(actionType: TambalBanNextActionType) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }

            try {
                val order = orderRepository.getOrderById(orderId) ?: run {
                    _uiState.update { it.copy(isLoading = false, error = "Order tidak ditemukan") }
                    return@launch
                }

                when (actionType) {
                    TambalBanNextActionType.ACCEPT_OFFER -> {
                        orderRepository.acceptOnDemandOffer(order)
                            .onSuccess {
                                orderRepository.updateOrderStatus(orderId, "arriving")
                            }
                    }
                    TambalBanNextActionType.NAVIGATE_TO_LOCATION -> {
                        orderRepository.updateOrderStatus(orderId, "arrived")
                    }
                    TambalBanNextActionType.ARRIVED_AT_LOCATION -> {
                        // Skip face verification check — advance directly to verifying
                        orderRepository.updateOrderStatus(orderId, "verifying")
                    }
                    TambalBanNextActionType.VERIFY_FACE -> {
                        // Advance past identity verification to inspection
                        orderRepository.updateOrderStatus(orderId, "inspecting")
                    }
                    TambalBanNextActionType.CAPTURE_INSPECTION -> {
                        // Advance from inspecting to service in progress
                        orderRepository.updateOrderStatus(orderId, "in_progress")
                    }
                    TambalBanNextActionType.START_SERVICE -> {
                        orderRepository.updateOrderStatus(orderId, "in_progress")
                    }
                    TambalBanNextActionType.COMPLETE_SERVICE -> {
                        orderRepository.updateOrderStatus(orderId, "service_complete")
                    }
                    TambalBanNextActionType.CAPTURE_COMPLETION -> {
                        // Submit tambal ban report
                        val reportRequest = mapOf(
                            "order_id" to orderId,
                            "service_type" to "tambal_ban",
                            "completed_at" to System.currentTimeMillis().toString()
                        )
                        orderRepository.createTambalBanReport(orderId, reportRequest)
                            .onSuccess {
                                orderRepository.updateOrderStatus(orderId, "completed")
                            }
                    }
                    TambalBanNextActionType.CONTACT_SUPPORT -> {
                        // Handled by UI — just refresh
                    }
                    TambalBanNextActionType.NONE -> {}
                }

                // Reload flow state after action
                loadOrder(orderId)
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(isLoading = false, error = e.message ?: "Gagal menjalankan aksi")
                }
            }
        }
    }
}
