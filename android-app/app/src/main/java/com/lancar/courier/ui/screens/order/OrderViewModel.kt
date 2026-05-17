package com.lancar.courier.ui.screens.order

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.lancar.courier.data.api.LANCARApiService
import com.lancar.courier.data.model.CourierProfile
import com.lancar.courier.data.model.DutyStatusRequest
import com.lancar.courier.data.model.Order
import com.lancar.courier.data.model.StatusUpdateRequest
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
        fetchCourierProfile()
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
                val profileResponse = apiService.getCourierProfile()
                val profileBody = profileResponse.body()
                if (profileResponse.isSuccessful && profileBody?.success == true) {
                    _courierProfile.update { profileBody.data }
                }

                val currentRole = profileBody?.data?.applicationChannel
                    ?: _courierProfile.value?.applicationChannel
                    ?: "on_demand"

                if (currentRole == "on_demand") {
                    val offerResponse = apiService.getOnDemandOffers()
                    if (offerResponse.isSuccessful && offerResponse.body()?.success == true) {
                        _offers.update { offerResponse.body()?.data ?: emptyList() }
                    }
                } else {
                    _offers.update { emptyList() }
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

    fun rejectOffer(order: Order) {
        viewModelScope.launch {
            val result = orderRepository.rejectOnDemandOffer(order.orderId)
            result.onSuccess {
                _offers.update { offers -> offers.filterNot { it.orderId == order.orderId } }
            }.onFailure { e ->
                _error.update { e.message ?: "Gagal menolak pekerjaan" }
            }
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
