package com.tembus.courier.data.db

import androidx.room.*
import com.tembus.courier.data.model.Order
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
     * Get pending scans (needs scan sync)
     */
    @Query("SELECT * FROM orders WHERE needsScanSync = 1 ORDER BY created_at ASC")
    fun getPendingScans(): Flow<List<Order>>

    /**
     * Get pending PoDs (needs PoD sync)
     */
    @Query("SELECT * FROM orders WHERE needsPodSync = 1 ORDER BY created_at ASC")
    fun getPendingPods(): Flow<List<Order>>

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
    @Query("UPDATE orders SET status = :status, updated_at = :updatedAt, needsSync = 1, sync_conflict = 0, sync_conflict_message = NULL WHERE order_id = :orderId")
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
    @Query("UPDATE orders SET needsSync = 0, sync_conflict = 0, sync_conflict_message = NULL WHERE order_id IN (:orderIds)")
    suspend fun markAsSynced(orderIds: List<String>)

    /**
     * Mark scans as synced
     */
    @Query("UPDATE orders SET needsScanSync = 0, proof_synced_at = :syncedAt, sync_conflict = 0, sync_conflict_message = NULL WHERE order_id IN (:orderIds)")
    suspend fun markScanAsSynced(orderIds: List<String>, syncedAt: Long = System.currentTimeMillis())

    /**
     * Mark PoDs as synced
     */
    @Query("UPDATE orders SET needsPodSync = 0, proof_synced_at = :syncedAt, sync_conflict = 0, sync_conflict_message = NULL WHERE order_id IN (:orderIds)")
    suspend fun markPodAsSynced(orderIds: List<String>, syncedAt: Long = System.currentTimeMillis())

    @Query("UPDATE orders SET sync_conflict = 1, sync_conflict_message = :message WHERE order_id = :orderId")
    suspend fun markSyncConflict(orderId: String, message: String)

    @Query("UPDATE orders SET sync_conflict = 0, sync_conflict_message = NULL WHERE order_id = :orderId")
    suspend fun clearSyncConflict(orderId: String)
}
