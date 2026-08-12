package com.tembus.customer.ui.screens.main

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.customer.data.model.DeliveryServiceProduct
import com.tembus.customer.data.model.Order
import com.tembus.customer.data.repository.NotificationRepository
import com.tembus.customer.data.repository.OrderRepository
import com.tembus.customer.data.session.AuthSessionManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class DashboardViewModel @Inject constructor(
    private val orderRepository: OrderRepository,
    private val notificationRepository: NotificationRepository,
    private val sessionManager: AuthSessionManager
) : ViewModel() {
    private val technicalErrorMarkers = listOf("HTTP ", "Exception", "java.", "kotlin.", "retrofit", "okhttp", "timeout")

    val customerName: StateFlow<String?> = sessionManager.customerName
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), "Pelanggan")

    // FB-126: backend TIDAK memblokir order food kedua — UI harus
    // tampilkan SEMUA order aktif (list), bukan satu banner saja.
    private val _activeOrders = MutableStateFlow<List<Order>>(emptyList())
    val activeOrders = _activeOrders.asStateFlow()

    private val _incomingPackages = MutableStateFlow<List<Order>>(emptyList())
    val incomingPackages = _incomingPackages.asStateFlow()

    private val _services = MutableStateFlow<List<DeliveryServiceProduct>>(emptyList())
    val services = _services.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading = _isLoading.asStateFlow()

    private val _dataError = MutableStateFlow<String?>(null)
    val dataError = _dataError.asStateFlow()

    private val _notificationUnreadCount = MutableStateFlow(0)
    val notificationUnreadCount = _notificationUnreadCount.asStateFlow()

    private val _notificationUnreadByCategory = MutableStateFlow<Map<String, Int>>(emptyMap())
    val notificationUnreadByCategory = _notificationUnreadByCategory.asStateFlow()

    init {
        refreshData()
        refreshNotificationCount()
    }

    fun refreshData() {
        viewModelScope.launch {
            _isLoading.value = true
            _dataError.value = null
            orderRepository.getOrderHistory().collectLatest { result ->
                _isLoading.value = false
                result.onSuccess { orders ->
                    // FB-126: kumpulkan SEMUA order yang masih berjalan
                    // (food + parcel), bukan firstOrNull. Customer bisa
                    // punya >1 order aktif sekaligus.
                    val terminal = setOf("delivered", "completed", "cancelled", "canceled", "failed", "rejected", "payment_failed")
                    val ongoing = orders.filter {
                        val s = it.status.lowercase()
                        s !in terminal && !s.contains("cancel")
                    }
                    _activeOrders.value = ongoing.ifEmpty {
                        // FIX 2026-08-11: fallback JANGAN memasukkan status terminal (cancelled dkk)
                        orders.filter {
                            val s = it.status.lowercase()
                            s !in terminal && s != "arrived" && !s.contains("cancel")
                        }
                    }
                }.onFailure { error ->
                    _activeOrders.value = emptyList()
                    _dataError.value = userSafeMessage(
                        error.localizedMessage,
                        "Riwayat pengiriman belum dapat dimuat. Coba lagi."
                    )
                }
            }
        }
        viewModelScope.launch {
            orderRepository.getIncomingPackages().collectLatest { result ->
                result.onSuccess { packages ->
                    _incomingPackages.value = packages
                        .filter { it.status.lowercase() !in setOf("cancelled", "payment_failed") }
                        .take(5)
                }.onFailure { error ->
                    _incomingPackages.value = emptyList()
                    _dataError.value = userSafeMessage(
                        error.localizedMessage,
                        "Paket masuk belum dapat dimuat. Coba lagi."
                    )
                }
            }
        }
        viewModelScope.launch {
            orderRepository.getCustomerDeliveryServices().collectLatest { result ->
                result.onSuccess { services ->
                    _services.value = services
                        .filter { it.serviceCategory in setOf("on_demand", "regular", "food_delivery") && it.isEnabled } // FIX 2026-08-11: food_delivery category ikut muncul di grid
                        .sortedBy { it.displayOrder }
                }.onFailure { error ->
                    _services.value = emptyList()
                    _dataError.value = userSafeMessage(
                        error.localizedMessage,
                        "Layanan pengiriman belum dapat dimuat. Coba lagi."
                    )
                }
            }
        }
    }

    private fun userSafeMessage(raw: String?, fallback: String): String {
        val message = raw?.trim().orEmpty()
        if (message.isBlank()) return fallback
        return if (technicalErrorMarkers.any { marker -> message.contains(marker, ignoreCase = true) }) {
            fallback
        } else {
            message.take(160)
        }
    }

    fun refreshNotificationCount() {
        viewModelScope.launch {
            notificationRepository.getUnreadCount()
                .onSuccess { count ->
                    _notificationUnreadCount.value = count.total.coerceAtLeast(0)
                    _notificationUnreadByCategory.value = count.byCategory
                        .mapKeys { it.key.lowercase() }
                        .mapValues { it.value.coerceAtLeast(0) }
                }
        }
    }
}
