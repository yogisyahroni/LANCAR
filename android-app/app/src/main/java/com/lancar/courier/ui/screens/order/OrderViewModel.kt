package com.lancar.courier.ui.screens.order

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.lancar.courier.data.model.Order
import com.lancar.courier.data.repository.OrderRepository
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/**
 * Order ViewModel
 * 
 * Manages order state for UI screens.
 * Handles offline queue operations and sync.
 */
class OrderViewModel(
    private val orderRepository: OrderRepository
) : ViewModel() {

    // All orders from local database
    val allOrders = orderRepository.getAllOrders()
        .stateIn(viewModelScope, SharingStarted.Lazily, emptyList())

    // Pending orders (needs sync)
    val pendingOrders = orderRepository.getPendingOrders()
        .stateIn(viewModelScope, SharingStarted.Lazily, emptyList())

    // Orders by status
    fun getOrdersByStatus(status: String) = orderRepository.getOrdersByStatus(status)
        .stateIn(viewModelScope, SharingStarted.Lazily, emptyList())

    /**
     * Add new order to offline queue
     */
    fun addOrder(order: Order) {
        viewModelScope.launch {
            orderRepository.addOrder(order)
        }
    }

    /**
     * Update order status
     */
    fun updateOrderStatus(orderId: String, status: String) {
        viewModelScope.launch {
            orderRepository.updateOrderStatus(orderId, status)
        }
    }

    /**
     * Sync pending orders with backend
     */
    fun syncPendingOrders(authToken: String) {
        viewModelScope.launch {
            orderRepository.syncPendingOrders(authToken)
        }
    }

    /**
     * Clear all orders
     */
    fun clearAllOrders() {
        viewModelScope.launch {
            orderRepository.clearAllOrders()
        }
    }

    /**
     * Get pending order count
     */
    fun getPendingCount() = orderRepository.getPendingCount()
}
