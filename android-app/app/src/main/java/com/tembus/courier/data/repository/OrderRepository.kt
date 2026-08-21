package com.tembus.courier.data.repository

import com.tembus.courier.data.api.TEMBUSApiService
import com.tembus.courier.data.db.OrderDao
import com.tembus.courier.data.model.CourierActiveRoutePlan
import com.tembus.courier.data.model.Order
import com.tembus.courier.data.model.StatusUpdateRequest
import com.tembus.courier.domain.CourierProofTypes
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.UUID
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
    private val apiService: TEMBUSApiService
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
    suspend fun saveScanLocally(
        orderId: String,
        latitude: Double,
        longitude: Double,
        scanType: String,
        synced: Boolean = false
    ) = withContext(Dispatchers.IO) {
        val order = orderDao.getOrderById(orderId) ?: return@withContext
        val now = System.currentTimeMillis()
        val normalizedScanType = normalizeScanType(scanType)
        val scanCompletesPickup = normalizedScanType == CourierProofTypes.PICKUP_SCAN
        val photoCompletesPickup = normalizedScanType == CourierProofTypes.PICKUP_PHOTO
        val pickupScanDone = order.pickupScanVerified || scanCompletesPickup
        val pickupPhotoDone = order.pickupPhotoVerified || photoCompletesPickup
        val nextStatus = when {
            normalizedScanType in setOf("delivery", "pod", CourierProofTypes.DELIVERY_POD_PHOTO) -> "delivered"
            pickupScanDone && pickupPhotoDone && order.status.lowercase() !in setOf("in_transit", "delivered", "completed") -> "in_transit"
            else -> order.status
        }
        orderDao.update(
            order.copy(
                needsScanSync = !synced && normalizedScanType != CourierProofTypes.PICKUP_PHOTO,
                scanLatitude = latitude,
                scanLongitude = longitude,
                scanType = normalizedScanType,
                status = nextStatus,
                pickupScanVerified = pickupScanDone,
                pickupPhotoVerified = pickupPhotoDone,
                pickupEvidenceUpdatedAt = if (scanCompletesPickup || photoCompletesPickup) now else order.pickupEvidenceUpdatedAt,
                proofSyncedAt = if (synced) now else order.proofSyncedAt,
                updatedAt = now
            )
        )
    }

    /**
     * Save PoD locally
     */
    suspend fun savePodLocally(
        orderId: String,
        imageUri: String,
        latitude: Double? = null,
        longitude: Double? = null,
        proofType: String = CourierProofTypes.DELIVERY_POD_PHOTO,
        synced: Boolean = false
    ) = withContext(Dispatchers.IO) {
        val order = orderDao.getOrderById(orderId) ?: return@withContext
        val now = System.currentTimeMillis()
        val normalizedProofType = CourierProofTypes.normalize(proofType)
        val isPickupProof = CourierProofTypes.isPickupProof(normalizedProofType)
        val isDeliveryProof = CourierProofTypes.isDeliveryProof(normalizedProofType)
        val pickupPhotoDone = order.pickupPhotoVerified || normalizedProofType == CourierProofTypes.PICKUP_PHOTO
        val pickupScanDone = order.pickupScanVerified || order.scanType in setOf("pickup", CourierProofTypes.PICKUP_SCAN)
        val nextStatus = when {
            isDeliveryProof -> "delivered"
            isPickupProof && pickupScanDone && pickupPhotoDone && order.status.lowercase() !in setOf("in_transit", "delivered", "completed") -> "in_transit"
            else -> order.status
        }
        orderDao.update(
            order.copy(
                needsPodSync = !synced,
                podImageUri = imageUri,
                podProofType = normalizedProofType,
                scanLatitude = latitude ?: order.scanLatitude,
                scanLongitude = longitude ?: order.scanLongitude,
                scanType = if (isPickupProof) CourierProofTypes.PICKUP_PHOTO else order.scanType,
                status = nextStatus,
                pickupPhotoVerified = pickupPhotoDone,
                pickupEvidenceUpdatedAt = if (isPickupProof) now else order.pickupEvidenceUpdatedAt,
                proofSyncedAt = if (synced) now else order.proofSyncedAt,
                updatedAt = now
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
            val targetId = order.dispatchId ?: order.orderId
            val response = apiService.acceptOnDemandOffer(
                orderId = targetId,
                idempotencyKey = idempotencyKey("offer-accept", targetId)
            )
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
            val targetId = order.dispatchId ?: order.orderId
            val response = apiService.rejectOnDemandOffer(
                orderId = targetId,
                idempotencyKey = idempotencyKey("offer-reject", targetId),
                request = mapOf("reason" to reason)
            )
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

    suspend fun fetchActiveRoutePlan(): Result<CourierActiveRoutePlan> = withContext(Dispatchers.IO) {
        try {
            val response = apiService.getCourierActiveRoutePlan()
            val body = response.body()
            if (response.isSuccessful && body?.success == true && body.data != null) {
                Result.success(body.data)
            } else {
                Result.failure(IllegalStateException(body?.message ?: "Route plan belum tersedia"))
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
    suspend fun syncPendingOrders(): Result<List<String>> = withContext(Dispatchers.IO) {
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
                        val request = com.tembus.courier.data.model.ScanRequest(
                            orderId = order.orderId,
                            scanType = order.scanType ?: "pickup",
                            latitude = scanLatitude,
                            longitude = scanLongitude,
                            accuracy = null
                        )
                    val response = apiService.scanPackage(
                        idempotencyKey = idempotencyKey("scan", "${order.orderId}-${order.scanType ?: "pickup"}-${order.updatedAt}"),
                        request = request
                    )
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
                        val latitudeBody = (order.scanLatitude ?: 0.0).toString().toRequestBody("text/plain".toMediaTypeOrNull())
                        val longitudeBody = (order.scanLongitude ?: 0.0).toString().toRequestBody("text/plain".toMediaTypeOrNull())
                        val accuracyBody = "0".toRequestBody("text/plain".toMediaTypeOrNull())
                        val proofType = CourierProofTypes.normalize(order.podProofType ?: CourierProofTypes.DELIVERY_POD_PHOTO)
                        val proofTypeBody = proofType.toRequestBody("text/plain".toMediaTypeOrNull())

                        val spoofRiskBody = "offline_sync".toRequestBody("text/plain".toMediaTypeOrNull())
                        val response = apiService.uploadPod(
                            idempotencyKey = idempotencyKey("pod", "${order.orderId}-$proofType-${order.updatedAt}"),
                            orderId = orderIdBody,
                            latitude = latitudeBody,
                            longitude = longitudeBody,
                            accuracy = accuracyBody,
                            proofType = proofTypeBody,
                            barcodeValue = null,
                            packageCode = null,
                            faceVerificationId = null,
                            overrideReason = null,
                            spoofRisk = spoofRiskBody,
                            photo = body
                        )
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
     * Submit tambal ban service report to backend
     */
    suspend fun createTambalBanReport(orderId: String, request: Map<String, Any>): Result<Boolean> = withContext(Dispatchers.IO) {
        try {
            val response = apiService.createTambalBanReport(request)
            if (response.isSuccessful) {
                orderDao.updateStatus(orderId, "report_submitted")
                Result.success(true)
            } else {
                Result.failure(IllegalStateException("Gagal mengirim laporan tambal ban"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    /**
     * Submit towing service report to backend
     */
    suspend fun createTowingReport(orderId: String, request: Map<String, Any>): Result<Boolean> = withContext(Dispatchers.IO) {
        try {
            val response = apiService.createTowingReport(request)
            if (response.isSuccessful) {
                orderDao.updateStatus(orderId, "report_submitted")
                Result.success(true)
            } else {
                Result.failure(IllegalStateException("Gagal mengirim laporan towing"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    /**
     * Get count of pending orders
     */
    suspend fun getPendingCount(): Int = withContext(Dispatchers.IO) {
        orderDao.getPendingCount()
    }

    private fun normalizeScanType(scanType: String): String {
        return when (scanType.trim().lowercase()) {
            "pickup" -> CourierProofTypes.PICKUP_SCAN
            "pickup_scan" -> CourierProofTypes.PICKUP_SCAN
            "pickup_photo" -> CourierProofTypes.PICKUP_PHOTO
            else -> scanType.trim().lowercase().ifBlank { CourierProofTypes.PICKUP_SCAN }
        }
    }

    private fun idempotencyKey(scope: String, discriminator: String): String {
        return "courier-$scope-$discriminator-${UUID.randomUUID()}"
    }
}
