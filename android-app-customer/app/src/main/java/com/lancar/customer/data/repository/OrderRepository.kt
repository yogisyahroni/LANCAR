package com.lancar.customer.data.repository

import com.lancar.customer.data.api.LANCARApiService
import com.lancar.customer.data.model.*
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import retrofit2.Response
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class OrderRepository @Inject constructor(
    private val apiService: LANCARApiService
) {
    fun getOrderHistory(): Flow<Result<List<Order>>> = flow {
        try {
            val response = apiService.getOrderHistory()
            if (response.isSuccessful && response.body()?.success == true) {
                emit(Result.success(response.body()?.data ?: emptyList()))
            } else {
                emit(Result.failure(Exception(response.body()?.message ?: "Unknown Error")))
            }
        } catch (e: Exception) {
            emit(Result.failure(e))
        }
    }

    fun createOrder(request: CreateOrderRequest): Flow<Result<Order>> = flow {
        try {
            val response = apiService.createOrder(request)
            val data = response.body()?.data
            if (response.isSuccessful && response.body()?.success == true && data != null) {
                emit(Result.success(data))
            } else {
                emit(Result.failure(Exception(response.body()?.message ?: "Failed to create order")))
            }
        } catch (e: Exception) {
            emit(Result.failure(e))
        }
    }

    fun getCustomerDeliveryServices(): Flow<Result<List<DeliveryServiceProduct>>> = flow {
        try {
            val response = apiService.getCustomerDeliveryServices()
            val body = response.body()
            if (response.isSuccessful && body?.success == true) {
                emit(Result.success(body.services))
            } else {
                emit(Result.failure(Exception("Layanan belum tersedia")))
            }
        } catch (e: Exception) {
            emit(Result.failure(e))
        }
    }

    suspend fun calculateCustomerOrderPrice(request: CustomerPriceEstimateRequest): Result<PriceBreakdown> {
        return try {
            val response = apiService.calculateCustomerOrderPrice(request)
            val body = response.body()
            if (response.isSuccessful && body != null) {
                Result.success(body)
            } else {
                Result.failure(Exception("Gagal menghitung harga"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    fun createCustomerOnDemandOrder(request: CustomerOrderCreateRequest): Flow<Result<CreatedCustomerOrder>> = flow {
        try {
            val response = apiService.createCustomerOnDemandOrder(request)
            val body = response.body()
            val order = body?.order
            if (response.isSuccessful && body?.success == true && order != null) {
                emit(Result.success(order))
            } else {
                emit(Result.failure(Exception(body?.error ?: "Gagal membuat order")))
            }
        } catch (e: Exception) {
            emit(Result.failure(e))
        }
    }

    fun getOrderDetail(orderId: String): Flow<Result<Order>> = flow {
        try {
            val detailResult = getOrderTrackingDetail(orderId)
            if (detailResult.isSuccess) {
                val detail = detailResult.getOrThrow()
                val trackingOrder = detail.order
                emit(Result.success(
                    Order(
                        orderId = trackingOrder.id,
                        pickupAddress = trackingOrder.pickupAddress.orEmpty(),
                        dropAddress = trackingOrder.dropoffAddress.orEmpty(),
                        distance = trackingOrder.distanceKm?.toString().orEmpty(),
                        fee = trackingOrder.totalPriceIdr?.toString().orEmpty(),
                        customerName = trackingOrder.recipientName.orEmpty(),
                        status = trackingOrder.status,
                        courierName = trackingOrder.courierName,
                        courierVehicle = trackingOrder.courierVehicle,
                        courierPlate = trackingOrder.courierPlate,
                        courierPhone = trackingOrder.courierPhone
                    )
                ))
            } else {
                emit(Result.failure(detailResult.exceptionOrNull() ?: Exception("Order not found")))
            }
        } catch (e: Exception) {
            emit(Result.failure(e))
        }
    }

    suspend fun getOrderTrackingDetail(orderId: String): Result<OrderTrackingDetail> {
        return try {
            val response = apiService.getOrderTrackingDetail(orderId)
            val body = response.body()
            val detail = body?.data
            if (response.isSuccessful && body?.success == true && detail != null) {
                Result.success(detail)
            } else {
                Result.failure(Exception(body?.message ?: "Detail tracking belum tersedia"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    fun initiatePayment(orderId: String, method: String = "QRIS"): Flow<Result<String>> = flow {
        try {
            val response = apiService.initiatePayment(orderId, PaymentRequest(method))
            val paymentUrl = response.body()?.data?.paymentUrl
            if (response.isSuccessful && paymentUrl != null) {
                emit(Result.success(paymentUrl))
            } else {
                emit(Result.failure(Exception("Gagal memicu pembayaran")))
            }
        } catch (e: Exception) {
            emit(Result.failure(e))
        }
    }
}
