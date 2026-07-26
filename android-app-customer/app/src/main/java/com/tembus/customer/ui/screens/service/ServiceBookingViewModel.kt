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

data class ServiceBookingUiState(
    val isLoading: Boolean = false,
    val priceEstimate: ServicePriceEstimate? = null,
    val error: String? = null,
    val orderId: String? = null
)

data class ServicePriceEstimate(
    val courierServicePrice: Long = 0,
    val perKmRate: Long = 0,
    val distanceKm: Double = 0.0,
    val baseFare: Long = 0,
    val totalPrice: Long = 0
)

@HiltViewModel
class ServiceBookingViewModel @Inject constructor(
    private val orderRepository: OrderRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(ServiceBookingUiState())
    val uiState: StateFlow<ServiceBookingUiState> = _uiState.asStateFlow()

    fun createOrder(
        serviceSubType: String,
        vehicleType: String,
        damageType: String,
        notes: String,
        customerLat: Double,
        customerLng: Double,
        customerAddress: String
    ) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            
            // TODO: Implement actual order creation
            // For now, simulate success
            _uiState.update {
                it.copy(
                    isLoading = false,
                    orderId = "ORDER-${System.currentTimeMillis()}"
                )
            }
        }
    }
}
