package com.lancar.courier.data.repository

import com.lancar.courier.data.api.LANCARApiService
import com.lancar.courier.data.db.OrderDao
import com.lancar.courier.data.model.Order
import com.lancar.courier.data.model.StatusUpdateRequest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Order Repository
 * 
 * Handles order operations including offline queue management and sync.
 * Coordinates between local database and backend API.
 */
@Singleton
class OrderRepository @Inject constructor(
    private val orderDao: OrderDao,
    private val apiService: LANCARApiService
) {

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
     * Save scan locally
     */
    suspend fun saveScanLocally(orderId: String, latitude: Double, longitude: Double, scanType: String) = withContext(Dispatchers.IO) {
        val order = orderDao.getOrderById(orderId) ?: return@withContext
        orderDao.update(
            order.copy(
                needsScanSync = true,
                scanLatitude = latitude,
                scanLongitude = longitude,
                scanType = scanType,
                status = "picked_up",
                updatedAt = System.currentTimeMillis()
            )
        )
    }

    /**
     * Save PoD locally
     */
    suspend fun savePodLocally(orderId: String, imageUri: String) = withContext(Dispatchers.IO) {
        val order = orderDao.getOrderById(orderId) ?: return@withContext
        orderDao.update(
            order.copy(
                needsPodSync = true,
                podImageUri = imageUri,
                status = "delivered",
                updatedAt = System.currentTimeMillis()
            )
        )
    }

    /**
     * Update order with new data
     */
    suspend fun updateOrder(order: Order) = withContext(Dispatchers.IO) {
        orderDao.update(order)
    }

    suspend fun acceptOnDemandOffer(order: Order): Result<Order> = withContext(Dispatchers.IO) {
        try {
            orderDao.upsert(order.copy(status = "accepting", workflowRole = "on_demand", needsSync = true))
            val response = apiService.acceptOnDemandOffer(order.dispatchId ?: order.orderId)
            if (response.isSuccessful && response.body()?.success == true) {
                val accepted = response.body()?.data ?: order.copy(status = "accepted", workflowRole = "on_demand")
                orderDao.deleteById(order.orderId)
                orderDao.upsert(accepted.copy(needsSync = false))
                Result.success(accepted)
            } else {
                Result.failure(IllegalStateException(response.body()?.message ?: "Gagal menerima pekerjaan"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun rejectOnDemandOffer(order: Order, reason: String = "courier_rejected"): Result<Boolean> = withContext(Dispatchers.IO) {
        try {
            val response = apiService.rejectOnDemandOffer(order.dispatchId ?: order.orderId, mapOf("reason" to reason))
            if (response.isSuccessful && response.body()?.success == true) {
                orderDao.deleteById(order.orderId)
                Result.success(true)
            } else {
                Result.failure(IllegalStateException(response.body()?.message ?: "Gagal menolak pekerjaan"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
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
    suspend fun syncPendingOrders(authToken: String = ""): Result<List<String>> = withContext(Dispatchers.IO) {
        try {
            val pendingOrders = orderDao.getPendingOrders().first()
            val pendingScans = orderDao.getPendingScans().first()
            val pendingPods = orderDao.getPendingPods().first()

            if (pendingOrders.isEmpty() && pendingScans.isEmpty() && pendingPods.isEmpty()) {
                return@withContext Result.success(emptyList())
            }

            val syncedOrderIds = mutableSetOf<String>()

            // Sync statuses
            for (order in pendingOrders) {
                val request = StatusUpdateRequest(
                    orderId = order.orderId,
                    status = order.status,
                    notes = order.deliveryNotes,
                    length = order.length,
                    width = order.width,
                    height = order.height,
                    weight = order.weight
                )
                val response = apiService.updateStatus(request)
                if (response.isSuccessful && response.body()?.success == true) {
                    orderDao.markAsSynced(listOf(order.orderId))
                    syncedOrderIds.add(order.orderId)
                }
            }

            // Sync scans
            for (order in pendingScans) {
                val scanLatitude = order.scanLatitude
                val scanLongitude = order.scanLongitude
                if (scanLatitude != null && scanLongitude != null) {
                    val request = com.lancar.courier.data.model.ScanRequest(
                        orderId = order.orderId,
                        scanType = order.scanType ?: "pickup",
                        latitude = scanLatitude,
                        longitude = scanLongitude
                    )
                    val response = apiService.scanPackage(request)
                    if (response.isSuccessful && response.body()?.success == true) {
                        orderDao.markScanAsSynced(listOf(order.orderId))
                        syncedOrderIds.add(order.orderId)
                    }
                }
            }

            // Sync PoDs
            for (order in pendingPods) {
                if (order.podImageUri != null) {
                    val file = java.io.File(android.net.Uri.parse(order.podImageUri).path ?: "")
                    if (file.exists()) {
                        val requestFile = file.asRequestBody("image/jpeg".toMediaTypeOrNull())
                        val body = MultipartBody.Part.createFormData("photo", file.name, requestFile)
                        val orderIdBody = order.orderId.toRequestBody("text/plain".toMediaTypeOrNull())

                        val response = apiService.uploadPod(orderIdBody, body)
                        if (response.isSuccessful && response.body()?.success == true) {
                            orderDao.markPodAsSynced(listOf(order.orderId))
                            syncedOrderIds.add(order.orderId)
                            
                            // 💾 OPTIMIZATION: Delete stitched local image after successful sync to prevent cache bloat
                            try {
                                if (file.exists()) {
                                    file.delete()
                                }
                            } catch (e: Exception) {
                                // Silent, non-blocking
                            }
                        }
                    }
                }
            }

            Result.success(syncedOrderIds.toList())
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
