package com.tembus.courier.ui.screens.order

import android.graphics.Bitmap
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.courier.data.api.TEMBUSApiService
import com.tembus.courier.data.api.withRequestReference
import com.tembus.courier.data.api.withRecoverableNextAction
import com.tembus.courier.data.model.CourierProfile
import com.tembus.courier.data.model.CourierCapabilityProfile
import com.tembus.courier.data.model.CourierEarningsLedger
import com.tembus.courier.data.model.CourierHotspot
import com.tembus.courier.data.model.CourierActiveRoutePlan
import com.tembus.courier.data.model.CourierPerformanceSummary
import com.tembus.courier.data.model.CourierPayoutCreateRequest
import com.tembus.courier.data.model.CourierPayoutRequestItem
import com.tembus.courier.data.model.CourierPayoutSummaryData
import com.tembus.courier.data.model.CourierRoutePreview
import com.tembus.courier.data.model.CourierSafetyEventRequest
import com.tembus.courier.data.model.CourierServiceProduct
import com.tembus.courier.data.model.CourierTrainingCompleteRequest
import com.tembus.courier.data.model.DutyStatusRequest
import com.tembus.courier.data.model.MapsProviderConfig
import com.tembus.courier.data.model.Order
import com.tembus.courier.data.model.OrderStatusTransition
import com.tembus.courier.data.model.StatusUpdateRequest
import com.tembus.courier.data.model.TripShareRequest
import com.tembus.courier.data.model.CancelPickupReason
import com.tembus.courier.data.model.SosTriggerRequest
import com.tembus.courier.data.model.SosTriggerResponse
import com.tembus.courier.data.model.SecurityLogRequest
import com.tembus.courier.data.repository.OrderRepository
import com.tembus.courier.data.repository.ServiceReportProofDraftStore
import com.tembus.courier.data.repository.ServiceReportProofUploader
import com.tembus.courier.data.config.RemoteConfigManager
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
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
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
    private val apiService: TEMBUSApiService,
    private val remoteConfigManager: RemoteConfigManager,
    private val proofUploader: ServiceReportProofUploader,
    private val proofDraftStore: ServiceReportProofDraftStore
) : ViewModel() {

    // ── State ─────────────────────────────────────────────────────

    private val _isSyncing = MutableStateFlow(false)
    val isSyncing: StateFlow<Boolean> = _isSyncing.asStateFlow()

    private val _syncIntervalMs = MutableStateFlow(30_000L)
    val syncIntervalMs: StateFlow<Long> = _syncIntervalMs.asStateFlow()

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

    private val _activeRoutePlan = MutableStateFlow<CourierActiveRoutePlan?>(null)
    val activeRoutePlan: StateFlow<CourierActiveRoutePlan?> = _activeRoutePlan.asStateFlow()

    private val _mapsProviderConfig = MutableStateFlow(MapsProviderConfig())
    val mapsProviderConfig: StateFlow<MapsProviderConfig> = _mapsProviderConfig.asStateFlow()

    private val _cancelPickupReasons = MutableStateFlow<List<CancelPickupReason>>(emptyList())
    val cancelPickupReasons: StateFlow<List<CancelPickupReason>> = _cancelPickupReasons.asStateFlow()

    private val _statusTransitions = MutableStateFlow<List<OrderStatusTransition>>(emptyList())
    val statusTransitions: StateFlow<List<OrderStatusTransition>> = _statusTransitions.asStateFlow()

    private val _lastRemoteSyncAt = MutableStateFlow<Long?>(null)
    val lastRemoteSyncAt: StateFlow<Long?> = _lastRemoteSyncAt.asStateFlow()

    private val refreshMutex = Mutex()
    private val technicalErrorMarkers = listOf(
        "HTTP ",
        "Exception",
        "timeout",
        "Socket",
        "retrofit",
        "kotlin.",
        "java.",
        "backend",
        "null"
    )

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
        viewModelScope.launch {
            remoteConfigManager.fetchConfig()
            _syncIntervalMs.value = remoteConfigManager.getSyncInterval()
        }
        fetchMapsProviderConfig()
        fetchCourierProfile()
        fetchPickupCancellationReasons(showUserErrors = false)
        fetchOrderStatusTransitions("on_demand", showUserErrors = false)
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

    fun fetchPickupCancellationReasons(showUserErrors: Boolean = true) {
        viewModelScope.launch {
            try {
                val response = apiService.getPickupCancellationReasons()
                val body = response.body()
                if (response.isSuccessful && body?.success == true && body.data != null) {
                    _cancelPickupReasons.update { body.data }
                } else {
                    _cancelPickupReasons.update { emptyList() }
                    if (showUserErrors) {
                        _error.update {
                            response.errorMessage(
                                serverMessage = body?.message,
                                fallback = "Gagal memuat alasan pembatalan pickup."
                            )
                        }
                    }
                }
            } catch (e: Exception) {
                _cancelPickupReasons.update { emptyList() }
                if (showUserErrors) {
                    _error.update { e.message ?: "Gagal memuat alasan pembatalan pickup." }
                }
            }
        }
    }

    fun fetchOrderStatusTransitions(workflowRole: String, showUserErrors: Boolean = true) {
        val normalizedRole = workflowRole.ifBlank { "on_demand" }
        viewModelScope.launch {
            try {
                val response = apiService.getOrderStatusTransitions(normalizedRole)
                val body = response.body()
                if (response.isSuccessful && body?.success == true && body.data != null) {
                    _statusTransitions.update { body.data }
                } else {
                    _statusTransitions.update { emptyList() }
                    if (showUserErrors) {
                        _error.update {
                            response.errorMessage(
                                serverMessage = body?.message,
                                fallback = "Gagal memuat policy transisi status."
                            )
                        }
                    }
                }
            } catch (e: Exception) {
                _statusTransitions.update { emptyList() }
                if (showUserErrors) {
                    _error.update { e.message ?: "Gagal memuat policy transisi status." }
                }
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
                Result.failure(
                    Exception(
                        response.errorMessage(
                            serverMessage = body?.message,
                            fallback = "Gagal memperbarui status duty. Coba lagi."
                        )
                    )
                )
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun updateCourierCapacity(maxWeightKg: Double?, maxPackages: Int?): Result<CourierProfile> {
        return try {
            val response = apiService.updateCapacity(
                com.tembus.courier.data.model.UpdateCapacityRequest(
                    maxWeightCapacityKg = maxWeightKg,
                    maxPackagesCapacity = maxPackages
                )
            )
            val body = response.body()
            if (response.isSuccessful && body?.success == true && body.data != null) {
                _courierProfile.update { body.data }
                Result.success(body.data)
            } else {
                Result.failure(
                    Exception(
                        response.errorMessage(
                            serverMessage = body?.message,
                            fallback = "Gagal memperbarui kapasitas. Coba lagi."
                        )
                    )
                )
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    // FOOD-BIKE-029: driver set radius jangkauan food delivery (1-20 km)
    suspend fun updateCourierRadius(radiusKm: Int): Result<CourierProfile> {
        return try {
            val response = apiService.updateRadius(
                com.tembus.courier.data.model.UpdateRadiusRequest(radiusKm = radiusKm)
            )
            val body = response.body()
            if (response.isSuccessful && body?.success == true && body.data != null) {
                _courierProfile.update { body.data }
                Result.success(body.data)
            } else {
                Result.failure(
                    Exception(
                        response.errorMessage(
                            serverMessage = body?.message,
                            fallback = "Gagal memperbarui radius. Coba lagi."
                        )
                    )
                )
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    private fun retrofit2.Response<*>.errorMessage(
        serverMessage: String? = null,
        fallback: String
    ): String {
        if (!serverMessage.isNullOrBlank()) return userSafeMessage(serverMessage, fallback).withRequestReference(this)

        val raw = errorBody()?.string() ?: return fallback.withRequestReference(this)
        return try {
            val body = Json.parseToJsonElement(raw).jsonObject
            userSafeMessage(body["message"]?.jsonPrimitive?.content, fallback)
                .withRecoverableNextAction(body["code"]?.jsonPrimitive?.content)
                .withRequestReference(this)
        } catch (_: Exception) {
            fallback.withRequestReference(this)
        }
    }

    private fun userSafeMessage(rawMessage: String?, fallback: String): String {
        val message = rawMessage?.trim().orEmpty()
        if (message.isBlank()) return fallback
        if (technicalErrorMarkers.any { marker -> message.contains(marker, ignoreCase = true) }) {
            return fallback
        }
        return message
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
                } else {
                    _statusTransitions.update { emptyList() }
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

                    orderRepository.fetchActiveRoutePlan()
                        .onSuccess { plan -> _activeRoutePlan.update { plan } }
                } else {
                    _offers.update { emptyList() }
                    _onDemandHotspots.update { emptyList() }
                    _activeRoutePlan.update { null }
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
                    orderRepository.mergeRemoteOrders(orders)
                    _lastRemoteSyncAt.update { System.currentTimeMillis() }
                    Result.success(Unit)
                } else {
                    val message = response.errorMessage(
                        serverMessage = responseBody?.message,
                        fallback = "Pesanan belum dapat dimuat. Coba lagi."
                    )
                    if (showUserErrors) _error.update { message }
                    Result.failure(Exception(message))
                }
            } catch (e: java.net.UnknownHostException) {
                if (showUserErrors) _error.update { "Tidak ada koneksi. Menampilkan data offline." }
                Result.failure(e)
            } catch (e: java.net.SocketTimeoutException) {
                if (showUserErrors) _error.update { "Sistem tidak merespons. Coba lagi." }
                Result.failure(e)
            } catch (e: Exception) {
                if (showUserErrors) _error.update { userSafeMessage(e.message, "Pesanan belum dapat dimuat. Coba lagi.") }
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
                if (showUserErrors) _error.update { userSafeMessage(e.message, "Data pencairan belum dapat dimuat.") }
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
                Result.failure(
                    Exception(
                        response.errorMessage(
                            serverMessage = body?.message,
                            fallback = "Gagal mengirim permintaan pencairan."
                        )
                    )
                )
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
    suspend fun triggerSos(
        latitude: Double,
        longitude: Double
    ): Result<SosTriggerResponse> {
        return try {
            val request = SosTriggerRequest(latitude, longitude)
            val response = apiService.triggerSos(request)
            val body = response.body()
            if (response.isSuccessful && body?.success == true && body.data != null) {
                Result.success(body.data)
            } else {
                Result.failure(
                    Exception(
                        response.errorMessage(
                            serverMessage = body?.message,
                            fallback = "Gagal memicu SOS ke pusat."
                        )
                    )
                )
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun createSafetyEvent(
        orderId: String?,
        eventType: String,
        reasonCode: String? = null,
        severity: String,
        latitude: Double?,
        longitude: Double?,
        accuracy: Float?,
        message: String?,
        photoFile: File? = null
    ): Result<String> {
        return try {
            val response = if (photoFile != null) {
                val textType = "text/plain".toMediaTypeOrNull()
                val photoBody = photoFile.asRequestBody("image/jpeg".toMediaTypeOrNull())
                val photoPart = MultipartBody.Part.createFormData("photo", photoFile.name, photoBody)
                apiService.createSafetyEventWithPhoto(
                    orderId = orderId?.toRequestBody(textType),
                    eventType = eventType.toRequestBody(textType),
                    reasonCode = reasonCode?.takeIf { it.isNotBlank() }?.toRequestBody(textType),
                    severity = severity.toRequestBody(textType),
                    latitude = latitude?.toString()?.toRequestBody(textType),
                    longitude = longitude?.toString()?.toRequestBody(textType),
                    accuracy = accuracy?.toString()?.toRequestBody(textType),
                    message = message?.takeIf { it.isNotBlank() }?.toRequestBody(textType),
                    photo = photoPart
                )
            } else {
                apiService.createSafetyEvent(
                    CourierSafetyEventRequest(
                        orderId = orderId,
                        eventType = eventType,
                        reasonCode = reasonCode,
                        severity = severity,
                        latitude = latitude,
                        longitude = longitude,
                        accuracy = accuracy,
                        message = message
                    )
                )
            }
            val body = response.body()
            if (response.isSuccessful && body?.success == true) {
                Result.success(body.message ?: "Laporan terkirim.")
            } else {
                Result.failure(
                    Exception(
                        response.errorMessage(
                            serverMessage = body?.message,
                            fallback = "Gagal mengirim laporan keselamatan."
                        )
                    )
                )
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
                Result.failure(
                    Exception(
                        response.errorMessage(
                            serverMessage = body?.message,
                            fallback = "Gagal membuat link berbagi perjalanan."
                        )
                    )
                )
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
                Result.failure(
                    Exception(
                        response.errorMessage(
                            serverMessage = body?.message,
                            fallback = "Gagal membatalkan pickup."
                        )
                    )
                )
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
                Result.failure(
                    Exception(
                        response.errorMessage(
                            serverMessage = body?.message,
                            fallback = "Gagal menyelesaikan training."
                        )
                    )
                )
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
                    idempotencyKey = "courier-status-$orderId-${status.trim().lowercase()}",
                    request = StatusUpdateRequest(orderId = orderId, status = status, notes = notes)
                )
                if (response.isSuccessful && response.body()?.success == true) {
                    // Mark as synced in local DB
                    val order = orderRepository.getOrderById(orderId)
                    if (order != null) {
                        orderRepository.updateOrder(order.copy(needsSync = false))
                        orderRepository.clearSyncConflict(orderId)
                    }
                } else if (response.code() == 409) {
                    orderRepository.markSyncConflict(
                        orderId,
                        response.body()?.message
                            ?: "Server menolak perubahan lokal karena data sudah berubah. Pilih penyelesaian konflik di detail order."
                    )
                    _error.update { "Perubahan order bentrok dengan data server. Buka detail order untuk menyelesaikannya." }
                }
                // If backend fails silently, needsSync=true allows WorkManager retry
            } catch (e: Exception) {
                // Network error — already saved locally, WorkManager will retry
            }
        }
    }

    /**
     * Submit service report for tambal ban / towing completion
     */
    fun submitServiceReport(
        orderId: String,
        serviceType: String,
        notes: String,
        completionPhoto: Bitmap? = null,
        signatureBitmap: Bitmap? = null,
        damageReport: Map<String, Any>? = null,
        onSuccess: () -> Unit = {}
    ) {
        viewModelScope.launch {
            val reportRequest = mutableMapOf<String, Any>(
                "order_id" to orderId,
                "service_type" to serviceType,
                "notes" to notes,
                "completed_at" to utcNowRfc3339()
            )
            damageReport?.let { reportRequest["damage_report"] = it }
            val beforePhotoUrl = proofDraftStore.getBeforePhotoUrl(orderId, serviceType)
            if (beforePhotoUrl.isNullOrBlank()) {
                _error.update {
                    if (serviceType == "towing") {
                        "Foto inspeksi awal kendaraan wajib tersimpan sebelum towing diselesaikan."
                    } else {
                        "Foto inspeksi awal ban wajib tersimpan sebelum layanan diselesaikan."
                    }
                }
                return@launch
            }
            when (serviceType) {
                "tambal_ban" -> {
                    val damageType = proofDraftStore.getTireDamageType(orderId)
                    if (damageType.isNullOrBlank()) {
                        _error.update { "Jenis kondisi/kerusakan ban dari inspeksi awal belum tersimpan. Kembali ke tahap inspeksi." }
                        return@launch
                    }
                    val durationMinutes = com.tembus.courier.domain.calculateTambalBanDurationMinutes(
                        proofDraftStore.getServiceStartedAtMillis(orderId, serviceType),
                        System.currentTimeMillis()
                    )
                    if (durationMinutes == null) {
                        _error.update { "Durasi pengerjaan belum valid. Mulai layanan dari tahap inspeksi atau hubungi dukungan jika pekerjaan melebihi 24 jam." }
                        return@launch
                    }
                    reportRequest["tire_photo_before_url"] = beforePhotoUrl
                    reportRequest["tire_condition_before"] = damageType
                    reportRequest["service_duration_minutes"] = durationMinutes
                    reportRequest["materials_used_items"] = proofDraftStore.getMaterialsUsed(orderId)
                    reportRequest["tire_condition_after"] = "repair_completed_verified_by_after_photo"
                }
                "towing" -> {
                    reportRequest["vehicle_photo_before_url"] = beforePhotoUrl
                    reportRequest["vehicle_condition_before"] = "Foto inspeksi awal kendaraan diambil di aplikasi kurir."
                    proofDraftStore.getProofUrl(orderId, serviceType, "loading_photo")?.let { reportRequest["loading_photo_url"] = it }
                    proofDraftStore.getProofUrl(orderId, serviceType, "unloading_photo")?.let {
                        reportRequest["unloading_photo_url"] = it
                        reportRequest["unloading_completed_at"] = utcNowRfc3339()
                    }
                }
            }
            if (completionPhoto != null) {
                val proofType = if (serviceType == "tambal_ban") "tire_photo_after" else "completion_photo"
                val uploadResult = proofUploader.upload(
                    orderId = orderId,
                    serviceType = serviceType,
                    proofType = proofType,
                    bitmap = completionPhoto
                )
                if (uploadResult.isFailure) {
                    _error.update { uploadResult.exceptionOrNull()?.message ?: "Bukti layanan belum berhasil diunggah." }
                    return@launch
                }
                val photoUrl = uploadResult.getOrNull().orEmpty()
                when (serviceType) {
                    "tambal_ban" -> reportRequest["tire_photo_after_url"] = photoUrl
                    "towing" -> reportRequest["completion_photo_url"] = photoUrl
                }
            }
            if (serviceType == "towing" && signatureBitmap != null) {
                val signatureUploadResult = proofUploader.upload(
                    orderId = orderId,
                    serviceType = serviceType,
                    proofType = "signature",
                    bitmap = signatureBitmap
                )
                if (signatureUploadResult.isFailure) {
                    _error.update { signatureUploadResult.exceptionOrNull()?.message ?: "Tanda tangan belum berhasil diunggah." }
                    return@launch
                }
                reportRequest["signature_url"] = signatureUploadResult.getOrNull().orEmpty()
            }
            val result = when (serviceType) {
                "tambal_ban" -> orderRepository.createTambalBanReport(orderId, reportRequest)
                "towing" -> orderRepository.createTowingReport(orderId, reportRequest)
                else -> Result.failure(IllegalArgumentException("Jenis layanan tidak didukung"))
            }
            result
                .onSuccess {
                    try {
                        // Tambal Ban updateOrderStatus is server-first and maps local
                        // `completed` to canonical `delivered`. Do not clear proof
                        // drafts or report success to UI until the server accepts it.
                        orderRepository.updateOrderStatus(orderId, "completed")
                        proofDraftStore.clearBeforePhotoUrl(orderId, serviceType)
                        if (serviceType == "tambal_ban") {
                            proofDraftStore.clearTambalBanStructuredDraft(orderId)
                        } else if (serviceType == "towing") {
                            proofDraftStore.clearProofUrl(orderId, serviceType, "loading_photo")
                            proofDraftStore.clearProofUrl(orderId, serviceType, "unloading_photo")
                        }
                        onSuccess()
                    } catch (error: Exception) {
                        _error.update {
                            error.message
                                ?: "Laporan tersimpan, tetapi status selesai belum dikonfirmasi server. Coba lagi."
                        }
                    }
                }
                .onFailure { error ->
                    _error.update { error.message ?: "Laporan layanan belum berhasil dikirim." }
                }
        }
    }

    private fun utcNowRfc3339(): String {
        return SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }.format(Date())
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
     * Explicitly discard the local pending mutation and keep the latest server
     * representation. This is only exposed from the conflict confirmation UI.
     */
    fun resolveConflictUsingServer(orderId: String) {
        viewModelScope.launch {
            try {
                val response = apiService.getOrders()
                val serverOrder = response.body()?.data?.firstOrNull { it.orderId == orderId }
                if (!response.isSuccessful || response.body()?.success != true || serverOrder == null) {
                    _error.update { "Versi server belum dapat dimuat. Coba lagi saat koneksi tersedia." }
                    return@launch
                }
                orderRepository.replaceWithServerOrder(serverOrder)
                _error.update { "Konflik selesai. Perubahan lokal order dibuang dan versi server digunakan." }
            } catch (e: Exception) {
                _error.update { "Konflik belum terselesaikan. Coba lagi saat koneksi tersedia." }
            }
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

    fun logLocalSecurityEvent(actionType: String, status: String = "success", onComplete: () -> Unit = {}) {
        viewModelScope.launch {
            try {
                apiService.logLocalSecurity(
                    SecurityLogRequest(
                        actionType = actionType,
                        status = status
                    )
                )
            } catch (e: Exception) {
                // Silently fail or log to crashlytics, we don't want to block courier flow on non-critical log failure
            } finally {
                onComplete()
            }
        }
    }
}
