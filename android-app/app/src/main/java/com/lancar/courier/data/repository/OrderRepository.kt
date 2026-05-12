package com.lancar.courier.data.repository

import android.content.Context
import com.lancar.courier.data.db.OrderDatabase
import com.lancar.courier.data.api.ApiClient
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

/**
 * Order Repository
 * 
 * Handles order operations including offline queue management and sync.
 * Coordinates between local database and backend API.
 */
class OrderRepository(private val context: Context) {

    private val orderDao = OrderDatabase.getDatabase(context).orderDao()
    private val apiService = ApiClient.apiService

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
                    notes = order.deliveryNotes
                )
                val response = apiService.updateStatus(request)
                if (response.isSuccessful && response.body()?.success == true) {
                    orderDao.markAsSynced(listOf(order.orderId))
                    syncedOrderIds.add(order.orderId)
                }
            }

            // Sync scans
            for (order in pendingScans) {
                if (order.scanLatitude != null && order.scanLongitude != null) {
                    val request = com.lancar.courier.data.model.ScanRequest(
                        orderId = order.orderId,
                        scanType = order.scanType ?: "pickup",
                        latitude = order.scanLatitude!!,
                        longitude = order.scanLongitude!!
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
