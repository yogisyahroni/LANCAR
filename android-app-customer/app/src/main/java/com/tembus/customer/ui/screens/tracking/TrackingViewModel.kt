package com.tembus.customer.ui.screens.tracking

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.customer.ui.components.maps.LatLng
import com.tembus.customer.data.model.MapsProviderConfig
import com.tembus.customer.data.model.OrderTrackingDetail
import com.tembus.customer.data.model.SafetyCenterData
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
import java.util.UUID

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
    val hasUnreadMessage: Boolean = false,
    val safetyCenter: SafetyCenterData? = null,
    val safetyActionPending: Boolean = false,
    val safetyMessage: String? = null,
    val safetyShareUrl: String? = null,
    val safetyShareExpiresAt: String? = null,
    val safetyShareTokenId: String? = null
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
    private val safetyActionKeys = mutableMapOf<String, String>()

    /**
     * Commences deterministic loop to pull telemetric coordinates every 5 seconds.
     */
    fun startTracking(orderId: String) {
        // Stop previous job if user re-triggers somehow
        pollingJob?.cancel()
        
        _uiState.update { it.copy(orderId = orderId, isLoading = true) }
        viewModelScope.launch { fetchSafetyCenter(orderId) }
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

    /** Refreshes the visible tracking snapshot without restarting the realtime room. */
    fun refresh(orderId: String? = _uiState.value.orderId) {
        val targetOrderId = orderId ?: return
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            fetchMapsProviderConfig()
            fetchLatestOrder(targetOrderId)
            fetchLatestTracking(targetOrderId)
            fetchUnreadMessageState()
            fetchSafetyCenter(targetOrderId)
            _uiState.update { it.copy(isLoading = false) }
        }
    }

    private suspend fun fetchLatestTracking(orderId: String) {
        val result = repository.getTrackingData(orderId)
        
        result.onSuccess { data ->
            val incomingStage = data.stage ?: data.status
            val liveRoutePoints = decodeEncodedPolyline(data.routePolyline)
            _uiState.update { currentState ->
                val currentStage = currentState.detail?.tracking?.stage
                if (!shouldAcceptTrackingSnapshot(currentStage, incomingStage)) return@update currentState
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
                    staleTrackingReason = if (data.locationStale) {
                        data.locationStaleReason ?: "Posisi terakhir sudah kedaluwarsa. Menunggu update GPS baru."
                    } else {
                        null
                    }
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

    private suspend fun fetchSafetyCenter(orderId: String) {
        repository.getSafetyCenter(orderId).onSuccess { center ->
            _uiState.update { it.copy(safetyCenter = center) }
        }.onFailure { exception ->
            // Terminal orders may legitimately return 404; do not show stale actions.
            if (_uiState.value.safetyCenter != null && exception.message?.contains("404") == true) {
                _uiState.update { it.copy(safetyCenter = null) }
            }
        }
    }

    fun reportSafety(orderId: String, message: String) {
        val note = message.trim().take(500)
        if (note.isBlank()) {
            _uiState.update { it.copy(safetyMessage = "Jelaskan situasi sebelum mengirim laporan.") }
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(safetyActionPending = true, safetyMessage = null) }
            val key = safetyActionKeys.getOrPut("report:$orderId") { "customer-safety-${UUID.randomUUID()}" }
            repository.reportSafety(orderId, note, key).onSuccess {
                safetyActionKeys.remove("report:$orderId")
                _uiState.update { it.copy(safetyMessage = "Laporan keselamatan tercatat. Status order tidak diubah otomatis.") }
                fetchSafetyCenter(orderId)
            }.onFailure { exception ->
                _uiState.update { it.copy(safetyMessage = exception.message ?: "Laporan keselamatan belum dapat dikirim.") }
            }
            _uiState.update { it.copy(safetyActionPending = false) }
        }
    }

    fun triggerSafetySos(orderId: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(safetyActionPending = true, safetyMessage = null) }
            val key = safetyActionKeys.getOrPut("sos:$orderId") { "customer-sos-${UUID.randomUUID()}" }
            repository.triggerSafetySos(orderId, key).onSuccess { result ->
                safetyActionKeys.remove("sos:$orderId")
                _uiState.update { it.copy(safetyMessage = if (result.escalation == "fallback_instructions") "SOS tercatat. Vendor darurat belum dikonfigurasi; ikuti instruksi darurat lokal dan hubungi bantuan resmi." else "SOS tercatat dan menunggu jalur eskalasi market.") }
                fetchSafetyCenter(orderId)
            }.onFailure { exception ->
                _uiState.update { it.copy(safetyMessage = exception.message ?: "SOS belum dapat dikirim. Gunakan layanan darurat lokal bila Anda dalam bahaya.") }
            }
            _uiState.update { it.copy(safetyActionPending = false) }
        }
    }

    fun createSafetyShare(orderId: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(safetyActionPending = true, safetyMessage = null) }
            val key = safetyActionKeys.getOrPut("share:$orderId") { "customer-safety-share-${UUID.randomUUID()}" }
            repository.createSafetyShare(orderId, key).onSuccess { share ->
                safetyActionKeys.remove("share:$orderId")
                _uiState.update {
                    it.copy(
                        safetyShareUrl = share.url,
                        safetyShareExpiresAt = share.expiresAt,
                        safetyShareTokenId = share.tokenId,
                        safetyMessage = "Link status order aktif selama 6 jam dan hanya menampilkan data minimum.",
                    )
                }
            }.onFailure { exception ->
                _uiState.update { it.copy(safetyMessage = exception.message ?: "Link berbagi belum dapat dibuat.") }
            }
            _uiState.update { it.copy(safetyActionPending = false) }
        }
    }

    fun revokeSafetyShare() {
        val tokenId = _uiState.value.safetyShareTokenId ?: return
        viewModelScope.launch {
            _uiState.update { it.copy(safetyActionPending = true, safetyMessage = null) }
            val key = safetyActionKeys.getOrPut("revoke-share:$tokenId") { "customer-safety-share-revoke-${UUID.randomUUID()}" }
            repository.revokeSafetyShare(tokenId, key).onSuccess {
                safetyActionKeys.remove("revoke-share:$tokenId")
                _uiState.update {
                    it.copy(
                        safetyShareUrl = null,
                        safetyShareExpiresAt = null,
                        safetyShareTokenId = null,
                        safetyMessage = "Link berbagi sudah dicabut.",
                    )
                }
            }.onFailure { exception ->
                _uiState.update { it.copy(safetyMessage = exception.message ?: "Link berbagi belum dapat dicabut.") }
            }
            _uiState.update { it.copy(safetyActionPending = false) }
        }
    }

    private suspend fun fetchLatestOrder(orderId: String) {
        orderRepository.getOrderTrackingDetail(orderId).onSuccess { detail ->
            val orderRoutePoints = decodeEncodedPolyline(
                detail.tracking?.orderRoutePolyline
                    ?: detail.tracking?.orderRouteSnapshot?.routePolyline
                    ?: detail.order.routePolyline
                    ?: detail.order.routeSnapshot?.routePolyline
            )
            _uiState.update { currentState ->
                val currentStage = currentState.detail?.tracking?.stage
                val incomingStage = detail.tracking?.stage
                if (!shouldAcceptTrackingSnapshot(currentStage, incomingStage)) return@update currentState
                val etaFromOrder = detail.tracking?.eta
                    ?: detail.tracking?.orderRouteSnapshot?.eta
                    ?: detail.tracking?.etaMinutes?.takeIf { minutes -> minutes > 0 }?.let { minutes -> "$minutes menit" }
                    ?: detail.order.routeSnapshot?.eta
                    ?: detail.order.routeSnapshot?.etaMinutes?.takeIf { minutes -> minutes > 0 }?.let { minutes -> "$minutes menit" }
                    ?: detail.order.etaMinutes?.takeIf { minutes -> minutes > 0 }?.let { minutes -> "$minutes menit" }
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


    fun retrySearch(orderId: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            orderRepository.retryOrderMatching(orderId).onSuccess {
                fetchLatestOrder(orderId)
            }.onFailure { exception ->
                _uiState.update { it.copy(error = exception.message ?: "Gagal mengulang pencarian kurir") }
            }
            _uiState.update { it.copy(isLoading = false) }
        }
    }

    fun retryWithSurge(orderId: String) {
        retrySearch(orderId)
    }

    fun cancelSearch(orderId: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            orderRepository.cancelOrder(orderId, "Pencarian kurir dibatalkan oleh pengguna").onSuccess {
                fetchLatestOrder(orderId)
            }.onFailure { exception ->
                _uiState.update { it.copy(error = exception.message ?: "Gagal membatalkan pencarian") }
            }
            _uiState.update { it.copy(isLoading = false) }
        }
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
