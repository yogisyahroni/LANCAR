package com.lancar.customer.ui.screens.tracking

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.android.gms.maps.model.LatLng
import com.lancar.customer.data.model.Order
import com.lancar.customer.data.model.TrackingResponse
import com.lancar.customer.data.repository.OrderRepository
import com.lancar.customer.data.repository.TrackingRepository
import kotlinx.coroutines.flow.collectLatest
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import javax.inject.Inject

data class TrackingUiState(
    val isLoading: Boolean = false,
    val error: String? = null,
    val courierLocation: LatLng? = null,
    val courierHeading: Float = 0f,
    val eta: String? = null,
    val orderId: String? = null,
    val order: Order? = null
)

@HiltViewModel
class TrackingViewModel @Inject constructor(
    private val repository: TrackingRepository,
    private val orderRepository: OrderRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(TrackingUiState())
    val uiState: StateFlow<TrackingUiState> = _uiState.asStateFlow()

    private var pollingJob: Job? = null

    /**
     * Commences deterministic loop to pull telemetric coordinates every 5 seconds.
     */
    fun startTracking(orderId: String) {
        // Stop previous job if user re-triggers somehow
        pollingJob?.cancel()
        
        _uiState.update { it.copy(orderId = orderId, isLoading = true) }

        // Fire background one-shot retrieval of order metadata to resolve driver details
        viewModelScope.launch {
            orderRepository.getOrderDetail(orderId).collectLatest { result ->
                result.onSuccess { fetchedOrder ->
                    _uiState.update { it.copy(order = fetchedOrder) }
                }
            }
        }

        pollingJob = viewModelScope.launch {
            while (isActive) {
                fetchLatestTracking(orderId)
                delay(5000) // 5-second deterministic refresh interval
            }
        }
    }

    fun stopTracking() {
        pollingJob?.cancel()
        pollingJob = null
    }

    private suspend fun fetchLatestTracking(orderId: String) {
        val result = repository.getTrackingData(orderId)
        
        result.onSuccess { data ->
            _uiState.update {
                it.copy(
                    isLoading = false,
                    error = null,
                    courierLocation = LatLng(data.location.latitude, data.location.longitude),
                    courierHeading = data.location.heading.toFloat(),
                    eta = data.eta ?: it.eta
                )
            }
        }.onFailure { exception ->
            // We don't overwrite previous data with error if we already had a location
            _uiState.update {
                it.copy(
                    isLoading = false,
                    error = if (it.courierLocation == null) exception.message else null
                )
            }
        }
    }

    override fun onCleared() {
        super.onCleared()
        stopTracking()
    }
}
