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
    val stage: TambalBanStage = TambalBanStage.NAVIGATING_TO_LOCATION,
    val earnings: EarningsData? = null,
    val error: String? = null,
    // Info pelanggan (standar industri: nama, telepon, alamat di halaman arrived)
    val customerName: String = "",
    val customerPhone: String = "",
    val activeAddress: String = "",
    // Resi publik (TMBSxxxxxx) — tampil utk kurir/customer, bukan UUID panjang
    val orderNumber: String = "",
    // Jenis kerusakan ban (design Stitch: Tubeless/Standar/Ganti/Isi Angin
    // → mekanisme existing: dipilih kurir saat inspeksi, dikirim di report)
    val damageType: String? = null
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
                                                isCompleted = flowState.stage == TambalBanStage.COMPLETED,
                                                nextActionLabel = flowState.nextAction.label,
                                                nextActionType = flowState.nextAction.type,
                                                stage = flowState.stage,
                                                customerName = order.customerName,
                                                                            customerPhone = order.phoneNumber.orEmpty(),
                                                                            activeAddress = flowState.activeAddress,
                                                                            orderNumber = order.orderNumber.orEmpty(),
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
                        // Submit tambal ban report — termasuk jenis kerusakan (jika dipilih)
                        val reportRequest = mutableMapOf<String, Any>(
                            "order_id" to orderId,
                            "service_type" to "tambal_ban",
                            "completed_at" to System.currentTimeMillis().toString()
                        )
                        _uiState.value.damageType?.let {
                            reportRequest["tire_damage_type"] = it
                        }
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

    fun setDamageType(damageType: String) {
        _uiState.update { it.copy(damageType = damageType) }
    }
}