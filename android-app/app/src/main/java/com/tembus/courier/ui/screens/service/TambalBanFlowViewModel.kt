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

    fun handleNextAction() {
        viewModelScope.launch {
            _uiState.update { state ->
                val nextStep = state.currentStepIndex + 1
                state.copy(
                    currentStepIndex = minOf(nextStep, 4),
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
