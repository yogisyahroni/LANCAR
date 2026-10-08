package com.tembus.customer.ui.screens.service

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.customer.data.policy.shouldRefreshMapsProviderConfig
import com.tembus.customer.data.model.MapsProviderConfig
import com.tembus.customer.data.repository.OrderRepository
import com.tembus.customer.ui.components.maps.LatLng
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ServiceTrackingUiState(
    val isLoading: Boolean = false,
    val currentStepIndex: Int = 0,
    val courierName: String? = null,
    val courierPhotoUrl: String? = null,
    val courierVehicle: String? = null,
    val courierPlate: String? = null,
    val orderNumber: String? = null,
    val pickupAddress: String? = null,
    val dropoffAddress: String? = null,
    val totalPriceIdr: Long? = null,
    val paymentStatus: String? = null,
    val paymentMethod: String? = null,
    val pricingBreakdown: com.tembus.customer.data.model.TrackingPriceBreakdown? = null,
    val routeDistanceMeters: Int? = null,
    val routeDurationSeconds: Int? = null,
    val statusText: String? = null,
    val etaMinutes: Int? = null,
    val error: String? = null,
    val hasSnapshot: Boolean = false,
    val isStale: Boolean = false,
    val isTerminal: Boolean = false,
    val canViewReport: Boolean = false,
    val noSupply: Boolean = false,
    val providerAssigned: Boolean = false,
    val mapsProviderConfig: MapsProviderConfig = MapsProviderConfig(),
    val pickupLocation: LatLng? = null,
    val dropoffLocation: LatLng? = null,
    val courierLocation: LatLng? = null,
    val routePoints: List<LatLng> = emptyList(),
    val providerSearchTimeoutMinutes: Int? = null,
    val providerSearchRemainingSeconds: Int? = null,
    val providerSearchTimedOut: Boolean = false
)

@HiltViewModel
class ServiceTrackingViewModel @Inject constructor(
    private val orderRepository: OrderRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(ServiceTrackingUiState())
    val uiState: StateFlow<ServiceTrackingUiState> = _uiState.asStateFlow()

    private var trackingJob: Job? = null
    private var mapsConfigLastSuccessfulAtMillis = 0L
    private var mapsConfigLastAttemptAtMillis = 0L

    fun startTracking(orderId: String, serviceSubType: String = "") {
        trackingJob?.cancel()
        trackingJob = viewModelScope.launch {
            while (isActive) {
                loadTrackingSnapshot(orderId, serviceSubType)
                if (_uiState.value.isTerminal) break
                delay(if (_uiState.value.hasSnapshot) 5_000L else 3_000L)
            }
        }
    }

    private suspend fun loadTrackingSnapshot(orderId: String, serviceSubType: String) {
            _uiState.update { it.copy(isLoading = true, error = null) }
            val mapsConfig = loadMapsProviderConfigIfStale()

            orderRepository.getOrderTrackingDetail(orderId)
                .onSuccess { detail ->
                    val order = detail.order
                    val tracking = detail.tracking
                    val terminal = isRoadsideTerminalStatus(order.status)
                    val normalizedStatus = normalizeRoadsideStatusForUi(order.status)
                    val providerAssigned = !order.courierName.isNullOrBlank() || normalizedStatus in setOf(
                        "assigned", "accepted", "pickup_arrived", "picking_up", "picked_up", "inbound_origin",
                        "outbound_origin", "inbound_destination", "outbound_destination", "delivering", "delivered"
                    )
                    val pickupLocation = latLngOrNull(order.pickupLatitude, order.pickupLongitude)
                    val dropoffLocation = latLngOrNull(order.dropoffLatitude, order.dropoffLongitude)
                    val courierLocation = tracking?.location?.let { location ->
                        latLngOrNull(location.latitude, location.longitude)
                    }
                    val liveRoute = decodeEncodedPolyline(tracking?.routePolyline)
                    val persistedRoute = decodeEncodedPolyline(
                        tracking?.orderRoutePolyline ?: order.routePolyline ?: order.routeSnapshot?.routePolyline
                    )
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            error = null,
                            currentStepIndex = if (serviceSubType.startsWith("tambal_ban")) {
                                tambalBanStepIndex(order.status)
                            } else {
                                towingStepIndex(order.status)
                            },
                            courierName = order.courierName,
                            courierPhotoUrl = order.courierPhotoUrl,
                            courierVehicle = order.courierVehicle,
                            courierPlate = order.courierPlate,
                            orderNumber = order.orderNumber ?: order.id,
                            pickupAddress = order.pickupAddress,
                            dropoffAddress = order.dropoffAddress,
                            totalPriceIdr = order.invoice?.amountIdr?.takeIf { amount -> amount > 0 } ?: order.totalPriceIdr,
                            paymentStatus = order.invoice?.paymentStatus,
                            paymentMethod = order.invoice?.paymentMethod,
                            pricingBreakdown = order.pricingBreakdown,
                            routeDistanceMeters = tracking?.orderRouteDistanceMeters
                                ?: order.routeDistanceMeters
                                ?: order.routeSnapshot?.distanceMeters,
                            routeDurationSeconds = tracking?.orderRouteDurationSeconds
                                ?: order.routeDurationSeconds
                                ?: order.routeSnapshot?.durationSeconds?.toInt(),
                            statusText = if (serviceSubType.startsWith("tambal_ban")) {
                                tambalBanStatusText(order.status)
                            } else {
                                towingStatusText(order.status)
                            },
                            etaMinutes = order.etaMinutes,
                            hasSnapshot = true,
                            isStale = false,
                            isTerminal = terminal,
                            canViewReport = terminal,
                            noSupply = isRoadsideNoSupplyStatus(order.status) || tracking?.providerSearchTimedOut == true,
                            providerAssigned = providerAssigned,
                            mapsProviderConfig = mapsConfig,
                            pickupLocation = pickupLocation,
                            dropoffLocation = dropoffLocation,
                            courierLocation = courierLocation,
                            routePoints = liveRoute.ifEmpty { persistedRoute },
                            providerSearchTimeoutMinutes = tracking?.providerSearchTimeoutMinutes,
                            providerSearchRemainingSeconds = tracking?.providerSearchRemainingSeconds,
                            providerSearchTimedOut = tracking?.providerSearchTimedOut == true
                        )
                    }
                }
                .onFailure { e ->
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            isStale = it.hasSnapshot,
                            error = e.message ?: "Status terbaru belum dapat dimuat. Tarik untuk mencoba lagi."
                        )
                    }
                }
    }

    private suspend fun loadMapsProviderConfigIfStale(force: Boolean = false): MapsProviderConfig {
        val now = System.currentTimeMillis()
        val currentConfig = _uiState.value.mapsProviderConfig
        if (!shouldRefreshMapsProviderConfig(
                nowMillis = now,
                lastSuccessfulAtMillis = mapsConfigLastSuccessfulAtMillis,
                lastAttemptAtMillis = mapsConfigLastAttemptAtMillis,
                ttlSeconds = currentConfig.ttlSeconds,
                force = force,
            )
        ) {
            return currentConfig
        }

        mapsConfigLastAttemptAtMillis = now
        return orderRepository.getMapsProviderConfig()
            .onSuccess { config ->
                mapsConfigLastSuccessfulAtMillis = System.currentTimeMillis()
                _uiState.update { it.copy(mapsProviderConfig = config) }
            }
            .getOrElse { currentConfig }
    }

    private fun latLngOrNull(latitude: Double?, longitude: Double?): LatLng? {
        if (latitude == null || longitude == null) return null
        if (!latitude.isFinite() || !longitude.isFinite()) return null
        if (latitude !in -90.0..90.0 || longitude !in -180.0..180.0) return null
        return LatLng(latitude, longitude)
    }

    private fun decodeEncodedPolyline(encoded: String?): List<LatLng> {
        if (encoded.isNullOrBlank()) return emptyList()
        val polyline = mutableListOf<LatLng>()
        var index = 0
        var latitude = 0
        var longitude = 0

        while (index < encoded.length) {
            var result = 0
            var shift = 0
            while (index < encoded.length) {
                val byte = encoded[index++].code - 63
                result = result or ((byte and 0x1f) shl shift)
                shift += 5
                if (byte < 0x20) break
            }
            val latitudeDelta = if ((result and 1) != 0) (result shr 1).inv() else result shr 1
            latitude += latitudeDelta

            result = 0
            shift = 0
            while (index < encoded.length) {
                val byte = encoded[index++].code - 63
                result = result or ((byte and 0x1f) shl shift)
                shift += 5
                if (byte < 0x20) break
            }
            val longitudeDelta = if ((result and 1) != 0) (result shr 1).inv() else result shr 1
            longitude += longitudeDelta
            polyline += LatLng(latitude / 1e5, longitude / 1e5)
        }
        return polyline
    }

    override fun onCleared() {
        trackingJob?.cancel()
        super.onCleared()
    }
}
