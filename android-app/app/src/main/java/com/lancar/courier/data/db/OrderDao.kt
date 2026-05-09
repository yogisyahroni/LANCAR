package com.lancar.courier.data.db

import androidx.room.*
import com.lancar.courier.data.model.Order
import kotlinx.coroutines.flow.Flow

/**
 * Order DAO (Data Access Object)
 * 
 * Provides database operations for Order entities.
 * Used for offline order queue storage and sync.
 */
@Dao
interface OrderDao {

    /**
     * Get all orders
     */
    @Query("SELECT * FROM orders ORDER BY created_at DESC")
    fun getAllOrders(): Flow<List<Order>>

    /**
     * Get orders by status
     */
    @Query("SELECT * FROM orders WHERE status = :status ORDER BY created_at DESC")
    fun getOrdersByStatus(status: String): Flow<List<Order>>

    /**
     * Get pending orders (needs sync)
     */
    @Query("SELECT * FROM orders WHERE needsSync = 1 ORDER BY created_at ASC")
    fun getPendingOrders(): Flow<List<Order>>

    /**
     * Get order by order ID
     */
    @Query("SELECT * FROM orders WHERE order_id = :orderId LIMIT 1")
    suspend fun getOrderById(orderId: String): Order?

    /**
     * Insert or update order (upsert)
     */
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(order: Order)

    /**
     * Insert multiple orders
     */
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(orders: List<Order>)

    /**
     * Update order status
     */
    @Query("UPDATE orders SET status = :status, updated_at = :updatedAt, needsSync = 1 WHERE order_id = :orderId")
    suspend fun updateStatus(orderId: String, status: String, updatedAt: Long = System.currentTimeMillis())

    /**
     * Update order with new data
     */
    @Update
    suspend fun update(order: Order)

    /**
     * Delete order
     */
    @Delete
    suspend fun delete(order: Order)

    /**
     * Delete order by order ID
     */
    @Query("DELETE FROM orders WHERE order_id = :orderId")
    suspend fun deleteById(orderId: String)

    /**
     * Clear all orders (on logout)
     */
    @Query("DELETE FROM orders")
    suspend fun clearAll()

    /**
     * Get count of pending orders
     */
    @Query("SELECT COUNT(*) FROM orders WHERE needsSync = 1")
    suspend fun getPendingCount(): Int

    /**
     * Mark orders as synced
     */
    @Query("UPDATE orders SET needsSync = 0 WHERE order_id IN (:orderIds)")
    suspend fun markAsSynced(orderIds: List<String>)
}
