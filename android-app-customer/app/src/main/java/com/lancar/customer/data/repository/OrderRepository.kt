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

    suspend fun getCustomerAddresses(kind: String? = null): Result<List<CustomerAddress>> {
        return try {
            val response = apiService.getCustomerAddresses(kind)
            val body = response.body()
            if (response.isSuccessful && body?.success == true) {
                Result.success(body.data)
            } else {
                Result.failure(Exception(body?.message ?: "Gagal memuat alamat tersimpan"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getMapsProviderConfig(): Result<MapsProviderConfig> {
        return try {
            val response = apiService.getMapsProviderConfig("customer_mobile")
            val body = response.body()
            if (response.isSuccessful && body != null) {
                Result.success(body)
            } else {
                Result.failure(Exception("Konfigurasi peta belum tersedia"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun createCustomerAddress(request: CustomerAddressRequest): Result<CustomerAddress> {
        return try {
            val response = apiService.createCustomerAddress(request)
            val body = response.body()
            val address = body?.data
            if (response.isSuccessful && body?.success == true && address != null) {
                Result.success(address)
            } else {
                Result.failure(Exception(body?.message ?: "Gagal menyimpan alamat"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun createReceiverLocationRequest(request: ReceiverLocationCreateRequest): Result<ReceiverLocationLink> {
        return try {
            val response = apiService.createReceiverLocationRequest(request)
            val body = response.body()
            val link = body?.data
            if (response.isSuccessful && body?.success == true && link != null) {
                Result.success(link)
            } else {
                Result.failure(Exception(body?.message ?: "Gagal membuat link lokasi penerima"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getReceiverLocationRequest(id: String): Result<ReceiverLocationLink> {
        return try {
            val response = apiService.getReceiverLocationRequest(id)
            val body = response.body()
            val link = body?.data
            if (response.isSuccessful && body?.success == true && link != null) {
                Result.success(link)
            } else {
                Result.failure(Exception(body?.message ?: "Lokasi penerima belum tersedia"))
            }
        } catch (e: Exception) {
            Result.failure(e)
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

    fun createCustomerPaymentSession(orderId: String): Flow<Result<CustomerPaymentSetup>> = flow {
        try {
            val response = apiService.createCustomerPaymentSession(orderId)
            val body = response.body()
            val payment = body?.payment
            if (response.isSuccessful && body?.success == true && payment != null) {
                emit(Result.success(payment))
            } else {
                emit(Result.failure(Exception(body?.message ?: body?.error ?: "Gagal menyiapkan pembayaran")))
            }
        } catch (e: Exception) {
            emit(Result.failure(e))
        }
    }

    suspend fun getCustomerPaymentStatus(orderId: String): Result<CustomerPaymentSetup> {
        return try {
            val response = apiService.getCustomerPaymentStatus(orderId)
            val body = response.body()
            val payment = body?.payment
            if (response.isSuccessful && body?.success == true && payment != null) {
                Result.success(payment)
            } else {
                Result.failure(Exception(body?.message ?: body?.error ?: "Gagal mengecek status pembayaran"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun confirmCustomerPayment(orderId: String): Result<CustomerPaymentSetup> {
        return try {
            val response = apiService.confirmCustomerPayment(orderId)
            val body = response.body()
            val payment = body?.payment ?: CustomerPaymentSetup(
                id = "PAY-$orderId",
                method = "MIDTRANS_SNAP",
                status = body?.paymentStatus ?: "paid",
                paymentStatus = body?.paymentStatus ?: "paid",
                orderStatus = body?.orderStatus ?: "pending",
                redirectUrl = body?.redirectUrl,
                snapToken = body?.snapToken,
                midtransOrderId = body?.midtransOrderId,
                expiresIn = body?.expiresIn ?: 0,
                expiresAt = body?.expiresAt
            )
            if (response.isSuccessful && body?.success == true) {
                Result.success(payment)
            } else {
                Result.failure(Exception(body?.message ?: body?.error ?: "Gagal mengonfirmasi pembayaran"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
