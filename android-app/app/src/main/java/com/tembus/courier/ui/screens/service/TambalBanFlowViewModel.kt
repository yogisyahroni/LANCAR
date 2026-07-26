package com.tembus.courier.ui.screens.service

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.courier.data.repository.OrderRepository
import com.tembus.courier.domain.TambalBanFlowResolver
import com.tembus.courier.domain.TambalBanStage
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
    val earnings: EarningsData? = null,
    val error: String? = null
)

@HiltViewModel
class TambalBanFlowViewModel @Inject constructor(
    private val orderRepository: OrderRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(TambalBanFlowUiState())
    val uiState: StateFlow<TambalBanFlowUiState> = _uiState.asStateFlow()

    fun loadOrder(orderId: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            
            orderRepository.getOrderDetail(orderId)
                .onSuccess { order ->
                    val flowState = TambalBanFlowResolver.resolve(order)
                    
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            currentStepIndex = flowState.currentStepIndex,
                            title = flowState.title,
                            instruction = flowState.instruction,
                            isCompleted = flowState.stage == TambalBanStage.COMPLETED,
                            nextActionLabel = flowState.nextAction.label,
                            earnings = EarningsData(
                                serviceFee = order.courierServicePrice,
                                baseFee = order.baseFeeApplied,
                                perKmRate = order.perKmRateApplied,
                                distanceKm = order.distanceKm,
                                tollCost = order.tollCost,
                                platformCommissionPct = 20.0,
                                platformCommissionAmt = (order.perKmRateApplied * order.distanceKm.toLong() * 20 / 100),
                                estimatedNetEarnings = order.totalPrice - (order.perKmRateApplied * order.distanceKm.toLong() * 20 / 100),
                                settlementModel = "per_km"
                            )
                        )
                    }
                }
                .onFailure { e ->
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            error = e.message ?: "Gagal memuat data"
                        )
                    }
                }
        }
    }

    fun handleNextAction() {
        viewModelScope.launch {
            // TODO: Implement actual state transition
            // For now, just advance to next step
            _uiState.update { state ->
                val nextStep = state.currentStepIndex + 1
                state.copy(
                    currentStepIndex = minOf(nextStep, 5),
                    title = when (nextStep) {
                        1 -> "Tiba di Lokasi"
                        2 -> "Verifikasi Wajah"
                        3 -> "Inspeksi Ban"
                        4 -> "Sedang Mengerjakan"
                        5 -> "Selesai"
                        else -> state.title
                    }
                )
            }
        }
    }
}
