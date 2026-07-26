package com.tembus.customer.ui.screens.service

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.customer.data.model.TambalBanReport
import com.tembus.customer.data.model.TowingReport
import com.tembus.customer.data.repository.OrderRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ServiceReportUiState(
    val isLoading: Boolean = false,
    val tambalBanReport: TambalBanReport? = null,
    val towingReport: TowingReport? = null,
    val error: String? = null
)

@HiltViewModel
class ServiceReportViewModel @Inject constructor(
    private val orderRepository: OrderRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(ServiceReportUiState())
    val uiState: StateFlow<ServiceReportUiState> = _uiState.asStateFlow()

    fun loadReport(orderId: String, serviceSubType: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            
            val isTambalBan = serviceSubType.startsWith("tambal_ban")
            
            if (isTambalBan) {
                orderRepository.getTambalBanReport(orderId)
                    .onSuccess { report ->
                        _uiState.update {
                            it.copy(isLoading = false, tambalBanReport = report)
                        }
                    }
                    .onFailure { e ->
                        _uiState.update {
                            it.copy(isLoading = false, error = e.message ?: "Gagal memuat laporan")
                        }
                    }
            } else {
                orderRepository.getTowingReport(orderId)
                    .onSuccess { report ->
                        _uiState.update {
                            it.copy(isLoading = false, towingReport = report)
                        }
                    }
                    .onFailure { e ->
                        _uiState.update {
                            it.copy(isLoading = false, error = e.message ?: "Gagal memuat laporan")
                        }
                    }
            }
        }
    }
}
