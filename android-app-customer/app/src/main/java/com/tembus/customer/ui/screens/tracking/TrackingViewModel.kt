package com.tembus.customer.ui.screens.tracking

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.customer.ui.components.maps.LatLng
import com.tembus.customer.data.model.MapsProviderConfig
import com.tembus.customer.data.model.OrderTrackingDetail
import com.tembus.customer.data.repository.NotificationRepository
import com.tembus.customer.data.repository.OrderRepository
import com.tembus.customer.data.repository.TrackingRepository
import com.tembus.customer.util.SocketManager
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
    val routePoints: List<LatLng> = emptyList(),
    val eta: String? = null,
    val orderId: String? = null,
    val detail: OrderTrackingDetail? = null,
    val mapsProviderConfig: MapsProviderConfig = MapsProviderConfig(),
    val mapsProviderError: String? = null,
    val lastLiveTrackingAt: Long? = null,
    val staleTrackingReason: String? = null,
    val hasUnreadMessage: Boolean = false
)

@HiltViewModel
class TrackingViewModel @Inject constructor(
    private val repository: TrackingRepository,
    private val orderRepository: OrderRepository,
    private val notificationRepository: NotificationRepository,
    private val socketManager: SocketManager
) : ViewModel() {

    private val _uiState = MutableStateFlow(TrackingUiState())
    val uiState: StateFlow<TrackingUiState> = _uiState.asStateFlow()

    private var pollingJob: Job? = null
    private var realtimeJob: Job? = null

    /**
     * Commences deterministic loop to pull telemetric coordinates every 5 seconds.
     */
    fun startTracking(orderId: String) {
        // Stop previous job if user re-triggers somehow
        pollingJob?.cancel()
        
        _uiState.update { it.copy(orderId = orderId, isLoading = true) }
        socketManager.connect()
        socketManager.joinOrderRoom(orderId)

        pollingJob = viewModelScope.launch {
            while (isActive) {
                fetchMapsProviderConfig()
                fetchLatestOrder(orderId)
                fetchLatestTracking(orderId)
                fetchUnreadMessageState()
                val ttlMs = (_uiState.value.mapsProviderConfig.ttlSeconds.coerceIn(30, 3600) * 1000L).coerceAtMost(5000L)
                delay(ttlMs)
            }
        }

        realtimeJob?.cancel()
        realtimeJob = viewModelScope.launch {
            socketManager.orderUpdates.collect { updatedOrderId ->
                if (updatedOrderId == orderId) {
                    fetchLatestOrder(orderId)
                    fetchLatestTracking(orderId)
                    fetchUnreadMessageState()
                }
            }
        }
    }

    fun stopTracking() {
        _uiState.value.orderId?.let { socketManager.leaveOrderRoom(it) }
        pollingJob?.cancel()
        realtimeJob?.cancel()
        pollingJob = null
        realtimeJob = null
    }

    private suspend fun fetchLatestTracking(orderId: String) {
        val result = repository.getTrackingData(orderId)
        
        result.onSuccess { data ->
            val liveRoutePoints = decodeEncodedPolyline(data.routePolyline)
            _uiState.update { currentState ->
                val orderRoutePolyline = data.orderRoutePolyline
                    ?: data.orderRouteSnapshot?.routePolyline
                    ?: currentState.detail?.order?.routePolyline
                    ?: currentState.detail?.order?.routeSnapshot?.routePolyline
                val orderRoutePoints = decodeEncodedPolyline(orderRoutePolyline)
                val resolvedRoutePoints = when {
                    liveRoutePoints.isNotEmpty() -> liveRoutePoints
                    orderRoutePoints.isNotEmpty() -> orderRoutePoints
                    else -> currentState.routePoints
                }
                val etaFromSnapshot = data.orderRouteSnapshot?.eta
                    ?: data.orderRouteSnapshot?.etaMinutes?.takeIf { minutes -> minutes > 0 }?.let { minutes -> "$minutes menit" }
                    ?: data.etaMinutes?.takeIf { minutes -> minutes > 0 }?.let { minutes -> "$minutes menit" }
                currentState.copy(
                    isLoading = false,
                    error = null,
                    courierLocation = LatLng(data.location.latitude, data.location.longitude),
                    courierHeading = data.location.heading.toFloat(),
                    routePoints = resolvedRoutePoints,
                    eta = data.eta ?: etaFromSnapshot ?: currentState.eta,
                    lastLiveTrackingAt = System.currentTimeMillis(),
                    staleTrackingReason = null
                )
            }
        }.onFailure { exception ->
            // Keep the last known backend position, but label it as stale.
            _uiState.update {
                it.copy(
                    isLoading = false,
                    error = if (it.courierLocation == null) exception.message else null,
                    staleTrackingReason = if (it.courierLocation != null) {
                        exception.message ?: "Koneksi tracking terputus. Menampilkan posisi terakhir."
                    } else {
                        null
                    }
                )
            }
        }
    }

    private suspend fun fetchMapsProviderConfig() {
        repository.getMapsProviderConfig().onSuccess { config ->
            _uiState.update {
                it.copy(
                    mapsProviderConfig = config,
                    mapsProviderError = null
                )
            }
        }.onFailure { exception ->
            _uiState.update {
                it.copy(mapsProviderError = exception.message)
            }
        }
    }

    private suspend fun fetchLatestOrder(orderId: String) {
        orderRepository.getOrderTrackingDetail(orderId).onSuccess { detail ->
            val orderRoutePoints = decodeEncodedPolyline(detail.order.routePolyline ?: detail.order.routeSnapshot?.routePolyline)
            _uiState.update { currentState ->
                val etaFromOrder = detail.order.routeSnapshot?.eta
                    ?: detail.order.routeSnapshot?.etaMinutes?.takeIf { minutes -> minutes > 0 }?.let { minutes -> "$minutes menit" }
                currentState.copy(
                    detail = detail,
                    routePoints = if (currentState.routePoints.isEmpty() && orderRoutePoints.isNotEmpty()) orderRoutePoints else currentState.routePoints,
                    eta = currentState.eta ?: etaFromOrder
                )
            }
        }
    }

    private suspend fun fetchUnreadMessageState() {
        notificationRepository.getUnreadCount().onSuccess { count ->
            val unreadMessages = count.byCategory["message"] ?: count.byCategory["MESSAGE"] ?: 0
            _uiState.update { it.copy(hasUnreadMessage = unreadMessages > 0) }
        }
    }

    override fun onCleared() {
        super.onCleared()
        stopTracking()
    }
}

private fun decodeEncodedPolyline(encoded: String?): List<LatLng> {
    if (encoded.isNullOrBlank()) return emptyList()
    val polyline = mutableListOf<LatLng>()
    var index = 0
    var lat = 0
    var lng = 0

    while (index < encoded.length) {
        var shift = 0
        var result = 0
        do {
            if (index >= encoded.length) return polyline
            val byteValue = encoded[index++].code - 63
            result = result or ((byteValue and 0x1f) shl shift)
            shift += 5
        } while (byteValue >= 0x20)
        val deltaLat = if ((result and 1) != 0) (result shr 1).inv() else result shr 1
        lat += deltaLat

        shift = 0
        result = 0
        do {
            if (index >= encoded.length) return polyline
            val byteValue = encoded[index++].code - 63
            result = result or ((byteValue and 0x1f) shl shift)
            shift += 5
        } while (byteValue >= 0x20)
        val deltaLng = if ((result and 1) != 0) (result shr 1).inv() else result shr 1
        lng += deltaLng

        polyline.add(LatLng(lat / 100000.0, lng / 100000.0))
    }

    return polyline
}
