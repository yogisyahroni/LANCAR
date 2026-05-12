package com.lancar.courier.ui.screens.order

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.lancar.courier.data.api.LANCARApiService
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
        fetchOrdersFromBackend()
    }

    fun clearError() {
        _error.update { null }
    }

    // ── Remote ────────────────────────────────────────────────────

    /**
     * Fetch all assigned orders from backend and upsert into local DB.
     * UI observes Room DB which updates reactively.
     */
    fun fetchOrdersFromBackend() {
        viewModelScope.launch {
            _isSyncing.update { true }
            try {
                val response = apiService.getOrders()
                if (response.isSuccessful && response.body()?.success == true) {
                    val orders = response.body()!!.data ?: emptyList()
                    // Mark as synced since they came from the server
                    val syncedOrders = orders.map { it.copy(needsSync = false) }
                    orderRepository.addOrders(syncedOrders)
                } else {
                    _error.update {
                        "Gagal memuat orders: ${response.body()?.message ?: "HTTP ${response.code()}"}"
                    }
                }
            } catch (e: java.net.UnknownHostException) {
                _error.update { "Tidak ada koneksi. Menampilkan data offline." }
            } catch (e: java.net.SocketTimeoutException) {
                _error.update { "Server tidak merespons. Coba lagi." }
            } catch (e: Exception) {
                _error.update { "Error: ${e.message}" }
            } finally {
                _isSyncing.update { false }
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
