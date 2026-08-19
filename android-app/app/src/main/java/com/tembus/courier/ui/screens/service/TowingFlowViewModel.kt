package com.tembus.courier.ui.screens.service

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.courier.data.repository.OrderRepository
import com.tembus.courier.data.model.distanceKmValue
import com.tembus.courier.data.model.cleanPayoutIdr
import com.tembus.courier.domain.TowingFlowResolver
import com.tembus.courier.domain.TowingStage
import com.tembus.courier.domain.TowingNextActionType
import com.tembus.courier.ui.components.service.EarningsData
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class TowingFlowUiState(
    val isLoading: Boolean = false,
    val currentStepIndex: Int = 0,
    val title: String = "",
    val instruction: String = "",
    val isCompleted: Boolean = false,
    val nextActionLabel: String = "",
    val nextActionType: TowingNextActionType = TowingNextActionType.NONE,
    val stage: TowingStage = TowingStage.NAVIGATING_TO_PICKUP,
    val earnings: EarningsData? = null,
    val error: String? = null,
    // Info pelanggan (standar industri: nama, telepon, alamat di halaman arrived)
    val customerName: String = "",
    val customerPhone: String = "",
    val activeAddress: String = ""
)

@HiltViewModel
class TowingFlowViewModel @Inject constructor(
    private val orderRepository: OrderRepository
) : ViewModel() {

    private var orderId: String = ""

    private val _uiState = MutableStateFlow(TowingFlowUiState())
    val uiState: StateFlow<TowingFlowUiState> = _uiState.asStateFlow()

    fun loadOrder(orderId: String) {
        this.orderId = orderId
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }

            try {
                val order = orderRepository.getOrderById(orderId)
                if (order != null) {
                    val flowState = TowingFlowResolver.resolve(order)
                    val distKm = order.distanceKmValue()
                    val payout = order.cleanPayoutIdr().toLong()
                    val pb = order.pricingBreakdown
                                                        val serviceFee = (pb?.serviceFeeIdr ?: 0).toLong()
                                                        val travelFee = (pb?.travelFeeIdr ?: 0).toLong()
                                                        // Komisi platform: pct dinamis dari admin (platform_commission_percent).
                                                                                            // Order lama tanpa field -> fallback 20 (default bisnis).
                                                                                            val platformPct = pb?.platformCommissionPct?.takeIf { it > 0 } ?: 20.0
                                                        val platformCommissionAmt = Math.ceil(travelFee * platformPct / 100)
                                                            .toLong()
                                                        // Biaya layanan platform (fixed, dibayar customer — bukan pendapatan kurir)
                                                        val platformServiceFee = (pb?.platformFeeIdr ?: 0).toLong()
                                                        val baseFare = (pb?.baseFareIdr ?: 0).toLong()
                                                        val perKmRate = (pb?.perKmIdr ?: 0).toLong()

                    _uiState.update {
                                            it.copy(
                                                isLoading = false,
                                                currentStepIndex = flowState.currentStepIndex,
                                                title = flowState.title,
                                                instruction = flowState.instruction,
                                                isCompleted = flowState.stage == TowingStage.COMPLETED,
                                                nextActionLabel = flowState.nextAction.label,
                                                nextActionType = flowState.nextAction.type,
                                                stage = flowState.stage,
                                                customerName = order.customerName,
                                                customerPhone = order.phoneNumber.orEmpty(),
                                                activeAddress = flowState.pickupAddress,
                                                earnings = EarningsData(
                                                            serviceFee = serviceFee,
                                                            baseFee = baseFare,
                                                            perKmRate = perKmRate,
                                                            distanceKm = distKm,
                                                            travelFee = travelFee,
                                                            tollCost = 0,
                                                            platformCommissionPct = platformPct,
                                                            platformCommissionAmt = platformCommissionAmt,
                                                            platformServiceFee = platformServiceFee,
                                                            estimatedNetEarnings = serviceFee + travelFee - platformCommissionAmt,
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

    fun handleNextAction(actionType: TowingNextActionType) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }

            try {
                val order = orderRepository.getOrderById(orderId) ?: run {
                    _uiState.update { it.copy(isLoading = false, error = "Order tidak ditemukan") }
                    return@launch
                }

                when (actionType) {
                    TowingNextActionType.ACCEPT_OFFER -> {
                        orderRepository.acceptOnDemandOffer(order)
                            .onSuccess {
                                orderRepository.updateOrderStatus(orderId, "arriving")
                            }
                    }
                    TowingNextActionType.NAVIGATE_TO_PICKUP -> {
                        orderRepository.updateOrderStatus(orderId, "arrived_pickup")
                    }
                    TowingNextActionType.ARRIVED_AT_PICKUP -> {
                        // Skip face check — advance directly to verifying
                        orderRepository.updateOrderStatus(orderId, "verifying")
                    }
                    TowingNextActionType.VERIFY_FACE -> {
                        // Advance past identity to inspection
                        orderRepository.updateOrderStatus(orderId, "inspecting")
                    }
                    TowingNextActionType.CAPTURE_INSPECTION -> {
                        // Advance from inspecting to loading
                        orderRepository.updateOrderStatus(orderId, "loading")
                    }
                    TowingNextActionType.START_LOADING -> {
                        orderRepository.updateOrderStatus(orderId, "loading")
                    }
                    TowingNextActionType.START_TRANSIT -> {
                        orderRepository.updateOrderStatus(orderId, "in_transit")
                    }
                    TowingNextActionType.ARRIVED_AT_DROPOFF -> {
                        orderRepository.updateOrderStatus(orderId, "arrived_dropoff")
                    }
                    TowingNextActionType.START_UNLOADING -> {
                        orderRepository.updateOrderStatus(orderId, "unloading")
                    }
                    TowingNextActionType.CAPTURE_COMPLETION -> {
                        val reportRequest = mapOf(
                            "order_id" to orderId,
                            "service_type" to "towing",
                            "completed_at" to System.currentTimeMillis().toString()
                        )
                        orderRepository.createTowingReport(orderId, reportRequest)
                            .onSuccess {
                                orderRepository.updateOrderStatus(orderId, "completed")
                            }
                    }
                    TowingNextActionType.CONTACT_SUPPORT -> { /* handled by UI */ }
                    TowingNextActionType.NONE -> {}
                }

                loadOrder(orderId)
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(isLoading = false, error = e.message ?: "Gagal menjalankan aksi")
                }
            }
        }
    }
}