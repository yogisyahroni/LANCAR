package com.lancar.customer.ui.screens.booking

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.android.gms.maps.model.LatLng
import com.lancar.customer.data.model.CreateOrderRequest
import com.lancar.customer.data.repository.OrderRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import javax.inject.Inject

data class BookingState(
    val pickupLocation: LatLng? = null,
    val pickupAddress: String = "",
    val destinationLocation: LatLng? = null,
    val destinationAddress: String = "",
    val estimatedPrice: Long = 0,
    val isLoading: Boolean = false,
    val error: String? = null
)

@HiltViewModel
class BookingViewModel @Inject constructor(
    private val orderRepository: OrderRepository
) : ViewModel() {

    private val _bookingState = MutableStateFlow(BookingState())
    val bookingState: StateFlow<BookingState> = _bookingState.asStateFlow()

    private val _bookingSuccess = MutableSharedFlow<String>()
    val bookingSuccess = _bookingSuccess.asSharedFlow()

    fun setPickup(location: LatLng, address: String) {
        _bookingState.value = _bookingState.value.copy(
            pickupLocation = location,
            pickupAddress = address
        )
        calculateRoute()
    }

    fun setDestination(location: LatLng, address: String) {
        _bookingState.value = _bookingState.value.copy(
            destinationLocation = location,
            destinationAddress = address
        )
        calculateRoute()
    }

    private fun calculateRoute() {
        val state = _bookingState.value
        if (state.pickupLocation != null && state.destinationLocation != null) {
            // For now, use mock price calculation logic, in production call API route matrix
            _bookingState.value = state.copy(estimatedPrice = 18000)
        }
    }

    fun confirmBooking() {
        val state = _bookingState.value
        if (state.pickupLocation == null || state.destinationLocation == null) {
            _bookingState.value = state.copy(error = "Lengkapi rute penjemputan dan tujuan.")
            return
        }

        viewModelScope.launch {
            _bookingState.value = _bookingState.value.copy(isLoading = true, error = null)
            
            val req = CreateOrderRequest(
                pickupAddress = state.pickupAddress,
                pickupLat = state.pickupLocation.latitude,
                pickupLng = state.pickupLocation.longitude,
                dropAddress = state.destinationAddress,
                dropLat = state.destinationLocation.latitude,
                dropLng = state.destinationLocation.longitude,
                itemDetails = "General Package",
                estimatedPrice = state.estimatedPrice
            )

            orderRepository.createOrder(req).collectLatest { result ->
                result.onSuccess { order ->
                    _bookingState.value = _bookingState.value.copy(isLoading = false)
                    _bookingSuccess.emit(order.orderId)
                }
                result.onFailure { e ->
                    _bookingState.value = _bookingState.value.copy(
                        isLoading = false,
                        error = e.localizedMessage ?: "Gagal melakukan pemesanan"
                    )
                }
            }
        }
    }

    fun clearError() {
        _bookingState.value = _bookingState.value.copy(error = null)
    }
}

