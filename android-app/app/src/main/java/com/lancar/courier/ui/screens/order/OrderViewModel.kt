package com.lancar.courier.ui.screens.order

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.lancar.courier.data.api.LANCARApiService
import com.lancar.courier.data.model.CourierProfile
import com.lancar.courier.data.model.CourierCapabilityProfile
import com.lancar.courier.data.model.CourierEarningsLedger
import com.lancar.courier.data.model.CourierHotspot
import com.lancar.courier.data.model.CourierPerformanceSummary
import com.lancar.courier.data.model.CourierPayoutCreateRequest
import com.lancar.courier.data.model.CourierPayoutRequestItem
import com.lancar.courier.data.model.CourierPayoutSummaryData
import com.lancar.courier.data.model.CourierRoutePreview
import com.lancar.courier.data.model.CourierSafetyEventRequest
import com.lancar.courier.data.model.CourierServiceProduct
import com.lancar.courier.data.model.CourierTrainingCompleteRequest
import com.lancar.courier.data.model.DutyStatusRequest
import com.lancar.courier.data.model.MapsProviderConfig
import com.lancar.courier.data.model.Order
import com.lancar.courier.data.model.OrderStatusTransition
import com.lancar.courier.data.model.StatusUpdateRequest
import com.lancar.courier.data.model.TripShareRequest
import com.lancar.courier.data.model.CancelPickupReason
import com.lancar.courier.data.repository.OrderRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.File
import java.util.UUID
import javax.inject.Inject

/**
 * Order ViewModel
 *
 * Manages order state for UI screens.
 * - Fetches orders from backend on demand
 * - Maintains local Room DB as offline cache (single source of truth)
 * - Handles status updates with optimistic local write + backend sync
 */
@HiltViewModel
class OrderViewModel @Inject constructor(
    private val orderRepository: OrderRepository,
    private val apiService: LANCARApiService
) : ViewModel() {

    // ── State ─────────────────────────────────────────────────────

    private val _isSyncing = MutableStateFlow(false)
    val isSyncing: StateFlow<Boolean> = _isSyncing.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    private val _offers = MutableStateFlow<List<Order>>(emptyList())
    val offers: StateFlow<List<Order>> = _offers.asStateFlow()

    private val _courierProfile = MutableStateFlow<CourierProfile?>(null)
    val courierProfile: StateFlow<CourierProfile?> = _courierProfile.asStateFlow()

    private val _onDemandServices = MutableStateFlow<List<CourierServiceProduct>>(emptyList())
    val onDemandServices: StateFlow<List<CourierServiceProduct>> = _onDemandServices.asStateFlow()

    private val _onDemandHotspots = MutableStateFlow<List<CourierHotspot>>(emptyList())
    val onDemandHotspots: StateFlow<List<CourierHotspot>> = _onDemandHotspots.asStateFlow()

    private val _performanceSummary = MutableStateFlow<CourierPerformanceSummary?>(null)
    val performanceSummary: StateFlow<CourierPerformanceSummary?> = _performanceSummary.asStateFlow()

    private val _earningsLedger = MutableStateFlow<CourierEarningsLedger?>(null)
    val earningsLedger: StateFlow<CourierEarningsLedger?> = _earningsLedger.asStateFlow()

    private val _payoutSummary = MutableStateFlow<CourierPayoutSummaryData?>(null)
    val payoutSummary: StateFlow<CourierPayoutSummaryData?> = _payoutSummary.asStateFlow()

    private val _payoutRequests = MutableStateFlow<List<CourierPayoutRequestItem>>(emptyList())
    val payoutRequests: StateFlow<List<CourierPayoutRequestItem>> = _payoutRequests.asStateFlow()

    private val _isPayoutSubmitting = MutableStateFlow(false)
    val isPayoutSubmitting: StateFlow<Boolean> = _isPayoutSubmitting.asStateFlow()

    private val _capabilityProfile = MutableStateFlow<CourierCapabilityProfile?>(null)
    val capabilityProfile: StateFlow<CourierCapabilityProfile?> = _capabilityProfile.asStateFlow()

    private val _routePreviews = MutableStateFlow<Map<String, CourierRoutePreview>>(emptyMap())
    val routePreviews: StateFlow<Map<String, CourierRoutePreview>> = _routePreviews.asStateFlow()

    private val _mapsProviderConfig = MutableStateFlow(MapsProviderConfig())
    val mapsProviderConfig: StateFlow<MapsProviderConfig> = _mapsProviderConfig.asStateFlow()

    private val _cancelPickupReasons = MutableStateFlow<List<CancelPickupReason>>(emptyList())
    val cancelPickupReasons: StateFlow<List<CancelPickupReason>> = _cancelPickupReasons.asStateFlow()

    private val _statusTransitions = MutableStateFlow<List<OrderStatusTransition>>(emptyList())
    val statusTransitions: StateFlow<List<OrderStatusTransition>> = _statusTransitions.asStateFlow()

    private val _lastRemoteSyncAt = MutableStateFlow<Long?>(null)
    val lastRemoteSyncAt: StateFlow<Long?> = _lastRemoteSyncAt.asStateFlow()

    private val refreshMutex = Mutex()

    // All orders from local Room DB (reactive)
    val allOrders = orderRepository.getAllOrders()
        .stateIn(viewModelScope, SharingStarted.Lazily, emptyList())

    // Pending orders that need sync
    val pendingOrders = orderRepository.getPendingOrders()
        .stateIn(viewModelScope, SharingStarted.Lazily, emptyList())

    // Today's delivered orders
    val deliveredTodayOrders = orderRepository.getOrdersByStatus("delivered")
        .stateIn(viewModelScope, SharingStarted.Lazily, emptyList())

    init {
        // Fetch fresh data from backend as soon as ViewModel starts
        fetchMapsProviderConfig()
        fetchCourierProfile()
        fetchPickupCancellationReasons()
        fetchOrderStatusTransitions("on_demand")
        fetchOrdersFromBackend()
    }

    fun clearError() {
        _error.update { null }
    }

    // ── Remote ────────────────────────────────────────────────────

    fun fetchCourierProfile() {
        viewModelScope.launch {
            try {
                val response = apiService.getCourierProfile()
                val body = response.body()
                if (response.isSuccessful && body?.success == true) {
                    _courierProfile.update { body.data }
                }
            } catch (_: Exception) {
            }
        }
    }

    fun fetchMapsProviderConfig() {
        viewModelScope.launch {
            try {
                val response = apiService.getMapsProviderConfig("courier_mobile")
                val body = response.body()
                if (response.isSuccessful && body != null) {
                    _mapsProviderConfig.update { body }
                }
            } catch (_: Exception) {
            }
        }
    }

    fun fetchPickupCancellationReasons() {
        viewModelScope.launch {
            try {
                val response = apiService.getPickupCancellationReasons()
                val body = response.body()
                if (response.isSuccessful && body?.success == true && body.data != null) {
                    _cancelPickupReasons.update { body.data }
                } else {
                    _cancelPickupReasons.update { emptyList() }
                    _error.update { body?.message ?: response.errorMessage() }
                }
            } catch (e: Exception) {
                _cancelPickupReasons.update { emptyList() }
                _error.update { e.message ?: "Gagal memuat alasan pembatalan pickup." }
            }
        }
    }

    fun fetchOrderStatusTransitions(workflowRole: String) {
        val normalizedRole = workflowRole.ifBlank { "on_demand" }
        viewModelScope.launch {
            try {
                val response = apiService.getOrderStatusTransitions(normalizedRole)
                val body = response.body()
                if (response.isSuccessful && body?.success == true && body.data != null) {
                    _statusTransitions.update { body.data }
                } else {
                    _statusTransitions.update { emptyList() }
                    _error.update { body?.message ?: response.errorMessage() }
                }
            } catch (e: Exception) {
                _statusTransitions.update { emptyList() }
                _error.update { e.message ?: "Gagal memuat policy transisi status." }
            }
        }
    }

    suspend fun updateDutyStatus(
        online: Boolean,
        latitude: Double? = null,
        longitude: Double? = null,
        accuracy: Float? = null
    ): Result<CourierProfile> {
        return try {
            val response = apiService.updateDutyStatus(
                DutyStatusRequest(
                    online = online,
                    latitude = latitude,
                    longitude = longitude,
                    accuracy = accuracy
                )
            )
            val body = response.body()
            if (response.isSuccessful && body?.success == true && body.data != null) {
                _courierProfile.update { body.data }
                Result.success(body.data)
            } else {
                Result.failure(Exception(body?.message ?: response.errorMessage()))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    private fun retrofit2.Response<*>.errorMessage(): String {
        val fallback = "Gagal memperbarui status duty. Coba lagi."
        val raw = errorBody()?.string() ?: return fallback
        return try {
            Json.parseToJsonElement(raw).jsonObject["message"]?.jsonPrimitive?.content ?: fallback
        } catch (_: Exception) {
            fallback
        }
    }

    /**
     * Fetch all assigned orders from backend and upsert into local DB.
     * UI observes Room DB which updates reactively.
     */
    fun fetchOrdersFromBackend() {
        viewModelScope.launch {
            refreshOrdersFromBackend(showUserErrors = true, showLoading = true)
        }
    }

    suspend fun refreshOrdersFromBackend(
        showUserErrors: Boolean = false,
        showLoading: Boolean = false,
        minIntervalMs: Long = 0L
    ): Result<Unit> {
        val lastSync = _lastRemoteSyncAt.value
        if (minIntervalMs > 0 && lastSync != null && System.currentTimeMillis() - lastSync < minIntervalMs) {
            return Result.success(Unit)
        }

        if (refreshMutex.isLocked) {
            return Result.success(Unit)
        }

        return refreshMutex.withLock {
            if (showLoading) _isSyncing.update { true }
            try {
                val mapsResponse = apiService.getMapsProviderConfig("courier_mobile")
                val mapsBody = mapsResponse.body()
                if (mapsResponse.isSuccessful && mapsBody != null) {
                    _mapsProviderConfig.update { mapsBody }
                }

                val profileResponse = apiService.getCourierProfile()
                val profileBody = profileResponse.body()
                if (profileResponse.isSuccessful && profileBody?.success == true) {
                    _courierProfile.update { profileBody.data }
                }

                val currentRole = profileBody?.data?.applicationChannel
                    ?: _courierProfile.value?.applicationChannel
                    ?: "on_demand"

                val transitionResponse = apiService.getOrderStatusTransitions(currentRole)
                val transitionBody = transitionResponse.body()
                if (transitionResponse.isSuccessful && transitionBody?.success == true) {
                    _statusTransitions.update { transitionBody.data ?: emptyList() }
                }

                if (currentRole == "on_demand") {
                    val serviceResponse = apiService.getOnDemandServices()
                    if (serviceResponse.isSuccessful && serviceResponse.body()?.success == true) {
                        _onDemandServices.update { serviceResponse.body()?.data ?: emptyList() }
                    }

                    val hotspotResponse = apiService.getOnDemandHotspots()
                    if (hotspotResponse.isSuccessful && hotspotResponse.body()?.success == true) {
                        _onDemandHotspots.update { hotspotResponse.body()?.data ?: emptyList() }
                    }

                    val offerResponse = apiService.getOnDemandOffers()
                    if (offerResponse.isSuccessful && offerResponse.body()?.success == true) {
                        _offers.update { offerResponse.body()?.data ?: emptyList() }
                    }
                } else {
                    _offers.update { emptyList() }
                    _onDemandHotspots.update { emptyList() }
                }

                val performanceResponse = apiService.getCourierPerformance()
                if (performanceResponse.isSuccessful && performanceResponse.body()?.success == true) {
                    _performanceSummary.update { performanceResponse.body()?.data }
                }

                val ledgerResponse = apiService.getCourierEarningsLedger()
                if (ledgerResponse.isSuccessful && ledgerResponse.body()?.success == true) {
                    _earningsLedger.update { ledgerResponse.body()?.data }
                }

                fetchPayoutState(showUserErrors = false)

                val capabilityResponse = apiService.getCourierCapabilities()
                if (capabilityResponse.isSuccessful && capabilityResponse.body()?.success == true) {
                    _capabilityProfile.update { capabilityResponse.body()?.data }
                }

                val response = apiService.getOrders()
                val responseBody = response.body()
                if (response.isSuccessful && responseBody?.success == true) {
                    val orders = responseBody.data ?: emptyList()
                    val syncedOrders = orders.map { it.copy(needsSync = false) }
                    orderRepository.addOrders(syncedOrders)
                    _lastRemoteSyncAt.update { System.currentTimeMillis() }
                    Result.success(Unit)
                } else {
                    val message = "Gagal memuat orders: ${responseBody?.message ?: "HTTP ${response.code()}"}"
                    if (showUserErrors) _error.update { message }
                    Result.failure(Exception(message))
                }
            } catch (e: java.net.UnknownHostException) {
                if (showUserErrors) _error.update { "Tidak ada koneksi. Menampilkan data offline." }
                Result.failure(e)
            } catch (e: java.net.SocketTimeoutException) {
                if (showUserErrors) _error.update { "Server tidak merespons. Coba lagi." }
                Result.failure(e)
            } catch (e: Exception) {
                if (showUserErrors) _error.update { "Error: ${e.message}" }
                Result.failure(e)
            } finally {
                if (showLoading) _isSyncing.update { false }
            }
        }
    }

    fun fetchPayoutState(showUserErrors: Boolean = true) {
        viewModelScope.launch {
            try {
                val summaryResponse = apiService.getCourierPayoutSummary()
                val summaryBody = summaryResponse.body()
                if (summaryResponse.isSuccessful && summaryBody?.success == true) {
                    _payoutSummary.update { summaryBody.data }
                }

                val requestsResponse = apiService.getCourierPayoutRequests()
                val requestsBody = requestsResponse.body()
                if (requestsResponse.isSuccessful && requestsBody?.success == true) {
                    _payoutRequests.update { requestsBody.data ?: emptyList() }
                }
            } catch (e: Exception) {
                if (showUserErrors) _error.update { e.message ?: "Gagal memuat data pencairan" }
            }
        }
    }

    suspend fun submitPayoutRequest(amountIdr: Int, transactionPin: String): Result<CourierPayoutRequestItem> {
        return try {
            _isPayoutSubmitting.update { true }
            val idempotencyKey = "courier-payout-${UUID.randomUUID()}"
            val response = apiService.createCourierPayoutRequest(
                idempotencyKey = idempotencyKey,
                request = CourierPayoutCreateRequest(
                    amountIdr = amountIdr,
                    transactionPin = transactionPin,
                    idempotencyKey = idempotencyKey
                )
            )
            val body = response.body()
            if (response.isSuccessful && body?.success == true && body.data != null) {
                val request = body.data.request
                fetchPayoutState(showUserErrors = false)
                Result.success(request)
            } else {
                Result.failure(Exception(body?.message ?: response.errorMessage()))
            }
        } catch (e: Exception) {
            Result.failure(e)
        } finally {
            _isPayoutSubmitting.update { false }
        }
    }

    fun acceptOffer(order: Order, onAccepted: (Order) -> Unit = {}) {
        viewModelScope.launch {
            val result = orderRepository.acceptOnDemandOffer(order)
            result.onSuccess { accepted ->
                _offers.update { offers -> offers.filterNot { it.orderId == accepted.orderId } }
                onAccepted(accepted)
            }.onFailure { e ->
                _error.update { e.message ?: "Gagal menerima pekerjaan" }
            }
        }
    }

    fun rejectOffer(order: Order, reason: String = "courier_rejected") {
        viewModelScope.launch {
            val result = orderRepository.rejectOnDemandOffer(order, reason)
            result.onSuccess {
                _offers.update { offers -> offers.filterNot { it.orderId == order.orderId } }
            }.onFailure { e ->
                _error.update { e.message ?: "Gagal menolak pekerjaan" }
            }
        }
    }

    fun loadRoutePreview(orderId: String) {
        viewModelScope.launch {
            try {
                val response = apiService.getCourierRoutePreview(orderId)
                if (response.isSuccessful && response.body()?.success == true && response.body()?.data != null) {
                    val preview = response.body()!!.data!!
                    _routePreviews.update { it + (orderId to preview) }
                }
            } catch (_: Exception) {
            }
        }
    }

    suspend fun createSafetyEvent(
        orderId: String?,
        eventType: String,
        severity: String,
        latitude: Double?,
        longitude: Double?,
        accuracy: Float?,
        message: String?
    ): Result<String> {
        return try {
            val response = apiService.createSafetyEvent(
                CourierSafetyEventRequest(
                    orderId = orderId,
                    eventType = eventType,
                    severity = severity,
                    latitude = latitude,
                    longitude = longitude,
                    accuracy = accuracy,
                    message = message
                )
            )
            val body = response.body()
            if (response.isSuccessful && body?.success == true) {
                Result.success(body.message ?: "Laporan terkirim.")
            } else {
                Result.failure(Exception(body?.message ?: response.errorMessage()))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun createTripShare(orderId: String): Result<String> {
        return try {
            val response = apiService.createTripShare(TripShareRequest(orderId))
            val body = response.body()
            if (response.isSuccessful && body?.success == true && body.data != null) {
                Result.success(body.data.url)
            } else {
                Result.failure(Exception(body?.message ?: response.errorMessage()))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun cancelOnDemandPickup(
        orderId: String,
        reasonCode: String,
        reasonNote: String?,
        latitude: Double?,
        longitude: Double?,
        accuracy: Float?,
        photoFile: File
    ): Result<String> {
        return try {
            val textType = "text/plain".toMediaTypeOrNull()
            val photoBody = photoFile.asRequestBody("image/jpeg".toMediaTypeOrNull())
            val photoPart = MultipartBody.Part.createFormData("photo", photoFile.name, photoBody)
            val response = apiService.cancelOnDemandPickup(
                orderId = orderId,
                reasonCode = reasonCode.toRequestBody(textType),
                reasonNote = reasonNote?.takeIf { it.isNotBlank() }?.toRequestBody(textType),
                latitude = latitude?.toString()?.toRequestBody(textType),
                longitude = longitude?.toString()?.toRequestBody(textType),
                accuracy = accuracy?.toString()?.toRequestBody(textType),
                photo = photoPart
            )
            val body = response.body()
            if (response.isSuccessful && body?.success == true) {
                orderRepository.deleteOrderById(orderId)
                fetchOrdersFromBackend()
                Result.success(body.message ?: "Pickup dibatalkan.")
            } else {
                Result.failure(Exception(body?.message ?: response.errorMessage()))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun completeTraining(): Result<String> {
        return try {
            val response = apiService.completeCourierTraining(CourierTrainingCompleteRequest())
            val body = response.body()
            if (response.isSuccessful && body?.success == true) {
                val capabilityResponse = apiService.getCourierCapabilities()
                if (capabilityResponse.isSuccessful && capabilityResponse.body()?.success == true) {
                    _capabilityProfile.update { capabilityResponse.body()?.data }
                }
                Result.success(body.message ?: "Training selesai.")
            } else {
                Result.failure(Exception(body?.message ?: response.errorMessage()))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    /**
     * Update order status — write locally first (optimistic), then sync to backend.
     * If backend fails, needsSync stays true and WorkManager will retry.
     */
    fun updateOrderStatusAndSync(orderId: String, status: String, notes: String? = null) {
        viewModelScope.launch {
            // 1. Optimistic local update immediately visible in UI
            orderRepository.updateOrderStatus(orderId, status)

            // 2. Try to sync to backend
            try {
                val response = apiService.updateStatus(
                    StatusUpdateRequest(orderId = orderId, status = status, notes = notes)
                )
                if (response.isSuccessful && response.body()?.success == true) {
                    // Mark as synced in local DB
                    val order = orderRepository.getOrderById(orderId)
                    if (order != null) {
                        orderRepository.updateOrder(order.copy(needsSync = false))
                    }
                }
                // If backend fails silently, needsSync=true allows WorkManager retry
            } catch (e: Exception) {
                // Network error — already saved locally, WorkManager will retry
            }
        }
    }

    // ── Local ─────────────────────────────────────────────────────

    /**
     * Add new order from FCM notification acceptance
     */
    fun addOrder(order: Order) {
        viewModelScope.launch {
            orderRepository.addOrder(order)
        }
    }

    /**
     * Sync all pending offline operations to backend
     */
    fun syncPendingOrders() {
        viewModelScope.launch {
            _isSyncing.update { true }
            val result = orderRepository.syncPendingOrders()
            result.onFailure { e ->
                _error.update { "Sync gagal: ${e.message}" }
            }
            _isSyncing.update { false }
        }
    }

    /**
     * Clear all orders — called on logout
     */
    fun clearAllOrders() {
        viewModelScope.launch {
            orderRepository.clearAllOrders()
        }
    }

    fun getOrdersByStatus(status: String) = orderRepository.getOrdersByStatus(status)
        .stateIn(viewModelScope, SharingStarted.Lazily, emptyList())

    suspend fun getPendingCount(): Int = orderRepository.getPendingCount()

    suspend fun getOrderById(orderId: String): Order? = orderRepository.getOrderById(orderId)
}
