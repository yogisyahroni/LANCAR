package com.lancar.customer.ui.screens.booking

import androidx.lifecycle.ViewModel
import com.google.android.gms.maps.model.LatLng
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject

data class BookingState(
    val pickupLocation: LatLng? = null,
    val pickupAddress: String = "",
    val destinationLocation: LatLng? = null,
    val destinationAddress: String = "",
    val estimatedPrice: Double = 0.0,
    val isSearching: Boolean = false,
    val mapCenteredOnUser: Boolean = true
)

@HiltViewModel
class BookingViewModel @Inject constructor() : ViewModel() {

    private val _bookingState = MutableStateFlow(BookingState())
    val bookingState: StateFlow<BookingState> = _bookingState.asStateFlow()

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

    fun resetMapCentering() {
        _bookingState.value = _bookingState.value.copy(mapCenteredOnUser = false)
    }

    private fun calculateRoute() {
        val state = _bookingState.value
        if (state.pickupLocation != null && state.destinationLocation != null) {
            // Placeholder calculation for "Premium" aesthetics demo
            // Real system will hook into backend matrix api later
            _bookingState.value = state.copy(estimatedPrice = 15000.0)
        }
    }
}
