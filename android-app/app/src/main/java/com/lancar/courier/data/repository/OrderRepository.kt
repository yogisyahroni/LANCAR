package com.lancar.courier.data.repository

import android.content.Context
import com.lancar.courier.data.db.OrderDatabase
import com.lancar.courier.data.model.Order
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext

/**
 * Order Repository
 * 
 * Handles order operations including offline queue management and sync.
 * Coordinates between local database and backend API.
 */
class OrderRepository(private val context: Context) {

    private val orderDao = OrderDatabase.getDatabase(context).orderDao()

    /**
     * Get all orders from local database
     */
    fun getAllOrders(): Flow<List<Order>> = orderDao.getAllOrders()

    /**
     * Get orders by status
     */
    fun getOrdersByStatus(status: String): Flow<List<Order>> = orderDao.getOrdersByStatus(status)

    /**
     * Get pending orders (needs sync with backend)
     */
    fun getPendingOrders(): Flow<List<Order>> = orderDao.getPendingOrders()

    /**
     * Get order by order ID
     */
    suspend fun getOrderById(orderId: String): Order? = withContext(Dispatchers.IO) {
        orderDao.getOrderById(orderId)
    }

    /**
     * Add new order to offline queue
     */
    suspend fun addOrder(order: Order) = withContext(Dispatchers.IO) {
        orderDao.upsert(order)
    }

    /**
     * Add multiple orders to offline queue
     */
    suspend fun addOrders(orders: List<Order>) = withContext(Dispatchers.IO) {
        orderDao.upsertAll(orders)
    }

    /**
     * Update order status locally
     */
    suspend fun updateOrderStatus(orderId: String, status: String) = withContext(Dispatchers.IO) {
        orderDao.updateStatus(orderId, status)
    }

    /**
     * Update order with new data
     */
    suspend fun updateOrder(order: Order) = withContext(Dispatchers.IO) {
        orderDao.update(order)
    }

    /**
     * Delete order
     */
    suspend fun deleteOrder(order: Order) = withContext(Dispatchers.IO) {
        orderDao.delete(order)
    }

    /**
     * Delete order by order ID
     */
    suspend fun deleteOrderById(orderId: String) = withContext(Dispatchers.IO) {
        orderDao.deleteById(orderId)
    }

    /**
     * Sync pending orders with backend
     * Returns list of successfully synced order IDs
     */
    suspend fun syncPendingOrders(authToken: String): Result<List<String>> = withContext(Dispatchers.IO) {
        try {
            val pendingOrders = orderDao.getPendingOrders().first()
            
            if (pendingOrders.isEmpty()) {
                return@withContext Result.success(emptyList())
            }

            val syncedOrderIds = mutableListOf<String>()

            for (order in pendingOrders) {
                // In production, this would call backend API to sync order
                // For now, mark as synced locally
                orderDao.markAsSynced(listOf(order.orderId))
                syncedOrderIds.add(order.orderId)
            }

            Result.success(syncedOrderIds)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    /**
     * Clear all orders (on logout)
     */
    suspend fun clearAllOrders() = withContext(Dispatchers.IO) {
        orderDao.clearAll()
    }

    /**
     * Get count of pending orders
     */
    suspend fun getPendingCount(): Int = withContext(Dispatchers.IO) {
        orderDao.getPendingCount()
    }
}
