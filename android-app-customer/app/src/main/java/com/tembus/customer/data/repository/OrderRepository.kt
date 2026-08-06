package com.tembus.customer.data.repository

import com.tembus.customer.data.api.TEMBUSApiService
import com.tembus.customer.data.api.withRequestReference
import com.tembus.customer.data.model.*
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import org.json.JSONObject
import retrofit2.Response
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class OrderRepository @Inject constructor(
    private val apiService: TEMBUSApiService
) {
    fun getOrderHistory(): Flow<Result<List<Order>>> = flow {
        try {
            val response = apiService.getOrderHistory()
            if (response.isSuccessful && response.body()?.success == true) {
                emit(Result.success(response.body()?.data ?: emptyList()))
            } else {
                emit(Result.failure(Exception(response.readErrorMessage(response.body()?.message ?: "Gagal memuat riwayat pesanan"))))
            }
        } catch (e: Exception) {
            emit(Result.failure(e))
        }
    }

    fun getIncomingPackages(): Flow<Result<List<Order>>> = flow {
        try {
            val response = apiService.getIncomingPackages()
            val body = response.body()
            if (response.isSuccessful && body?.success == true) {
                emit(Result.success(body.data ?: emptyList()))
            } else {
                emit(Result.failure(Exception(response.readErrorMessage(body?.message ?: "Paket masuk belum dapat dimuat"))))
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
                emit(Result.failure(Exception(response.readErrorMessage("Layanan belum tersedia"))))
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
                Result.failure(Exception(response.readErrorMessage("Gagal menghitung harga")))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun calculateCustomerOrderPrices(request: CustomerPriceEstimateRequest): Result<List<PriceBreakdown>> {
        return try {
            val response = apiService.calculateCustomerOrderPrices(request)
            val body = response.body()
            if (response.isSuccessful && body?.success == true) {
                Result.success(body.data)
            } else {
                val fallbackMessage = body?.message
                    ?: body?.errors?.firstOrNull()?.message
                    ?: "Gagal menghitung rute dan harga"
                Result.failure(Exception(response.readErrorMessage(fallbackMessage)))
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
                emit(Result.failure(Exception(response.readErrorMessage(body?.error ?: "Gagal membuat order"))))
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
                Result.failure(Exception(response.readErrorMessage(body?.message ?: "Gagal memuat alamat tersimpan")))
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

    suspend fun geocodeAddress(query: String): Result<List<MapsGeocodeResult>> {
        return try {
            val response = apiService.geocodeAddress(query.trim(), "customer_mobile")
            val body = response.body()
            if (response.isSuccessful && body != null) {
                Result.success(body.results)
            } else {
                Result.failure(Exception(response.readErrorMessage("Gagal mencari alamat")))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun reverseGeocodePoint(location: LocationPayload): Result<MapsGeocodeResult> {
        return try {
            val response = apiService.reverseGeocodePoint(
                latitude = location.lat,
                longitude = location.lng,
                scope = "customer_mobile"
            )
            val body = response.body()
            val result = body?.result
            if (response.isSuccessful && result != null) {
                Result.success(result)
            } else {
                Result.failure(Exception(response.readErrorMessage("Gagal membaca alamat dari titik peta")))
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
                Result.failure(Exception(response.readErrorMessage(body?.message ?: "Gagal menyimpan alamat")))
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
                Result.failure(Exception(response.readErrorMessage(body?.message ?: "Gagal membuat link lokasi penerima")))
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
                Result.failure(Exception(response.readErrorMessage(body?.message ?: "Lokasi penerima belum tersedia")))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun revokeReceiverLocationRequest(id: String): Result<ReceiverLocationLink> {
        return try {
            val response = apiService.revokeReceiverLocationRequest(id)
            val body = response.body()
            val link = body?.data
            if (response.isSuccessful && body?.success == true && link != null) {
                Result.success(link)
            } else {
                Result.failure(Exception(response.readErrorMessage(body?.message ?: "Gagal membatalkan link lokasi penerima")))
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
                Result.failure(Exception(response.readErrorMessage(body?.message ?: "Detail tracking belum tersedia")))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    fun createCustomerPaymentSession(orderId: String, paymentMethod: String): Flow<Result<CustomerPaymentSetup>> = flow {
        try {
            val response = apiService.createCustomerPaymentSession(
                orderId,
                CustomerPaymentCreateRequest(paymentMethod = paymentMethod)
            )
            val body = response.body()
            val payment = body?.payment
            if (response.isSuccessful && body?.success == true && payment != null) {
                emit(Result.success(payment))
            } else {
                emit(Result.failure(Exception(response.readErrorMessage(body?.message ?: body?.error ?: "Gagal menyiapkan pembayaran"))))
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
                Result.failure(Exception(response.readErrorMessage(body?.message ?: body?.error ?: "Gagal mengecek status pembayaran")))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun confirmCustomerPayment(orderId: String): Result<CustomerPaymentSetup> {
        return try {
            val response = apiService.confirmCustomerPayment(orderId)
            val body = response.body()
            val payment = body?.payment
            if (response.isSuccessful && body?.success == true && payment != null) {
                Result.success(payment)
            } else {
                Result.failure(Exception(response.readErrorMessage(body?.message ?: body?.error ?: "Gagal mengonfirmasi pembayaran")))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun uploadDisputeEvidence(orderId: String, file: okhttp3.MultipartBody.Part): Result<String> {
        return try {
            val response = apiService.uploadDisputeEvidence(orderId, file)
            val body = response.body()
            if (response.isSuccessful && body?.success == true && body.url != null) {
                Result.success(body.url)
            } else {
                Result.failure(Exception(response.readErrorMessage(body?.error ?: "Gagal mengunggah bukti masalah")))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun createCustomerDispute(request: CreateDisputeRequest): Result<CustomerDisputeResponse> {
        return try {
            val response = apiService.createCustomerDispute(request)
            val body = response.body()
            if (response.isSuccessful && body != null) {
                Result.success(body)
            } else {
                Result.failure(Exception(response.readErrorMessage("Gagal membuat pelaporan masalah")))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun cancelOrder(orderId: String, reason: String): Result<String> {
        return try {
            val response = apiService.cancelCustomerOrder(
                id = orderId,
                request = mapOf("reason" to reason)
            )
            val body = response.body()
            if (response.isSuccessful && body?.success == true) {
                Result.success(body.message ?: "Pesanan berhasil dibatalkan")
            } else {
                Result.failure(Exception(response.readErrorMessage(body?.message ?: "Gagal membatalkan pesanan")))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun retryOrderMatching(orderId: String): Result<String> {
        return try {
            val response = apiService.retryCustomerOrderMatching(id = orderId)
            val body = response.body()
            if (response.isSuccessful && body?.success == true) {
                Result.success(body.message ?: "Pencarian kurir berhasil diulang")
            } else {
                Result.failure(Exception(response.readErrorMessage(body?.message ?: "Gagal mengulang pencarian kurir")))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getRatingReminders(): Result<List<RatingReminderItem>> {
        return try {
            val response = apiService.getRatingReminders()
            val body = response.body()
            if (response.isSuccessful && body?.success == true) {
                Result.success(body.data)
            } else {
                Result.failure(Exception(response.readErrorMessage("Gagal mengambil rating reminders")))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun submitCourierRating(orderId: String, request: SubmitRatingRequest): Result<String> {
        return try {
            val response = apiService.submitCourierRating(orderId, request)
            val body = response.body()
            if (response.isSuccessful && body?.status == "success") {
                Result.success(body.message ?: "Berhasil mengirim rating")
            } else {
                Result.failure(Exception(response.readErrorMessage(body?.message ?: "Gagal mengirim rating")))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    /** Submit rating merchant (makanan) — FOOD-BIKE-060, terpisah dari driver. */
    suspend fun submitMerchantRating(orderId: String, request: SubmitRatingRequest): Result<String> {
        return try {
            val response = apiService.submitMerchantRating(orderId, request)
            val body = response.body()
            if (response.isSuccessful && body?.status == "success") {
                Result.success(body.message ?: "Berhasil mengirim rating")
            } else {
                Result.failure(Exception(response.readErrorMessage(body?.message ?: "Gagal mengirim rating")))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    private fun <T> Response<T>.readErrorMessage(fallback: String): String {
        return try {
            val raw = errorBody()?.string()?.takeIf { it.isNotBlank() } ?: return fallback.withRequestReference(this)
            val parsedMessage = runCatching {
                val json = JSONObject(raw)
                json.optString("message").takeIf { it.isNotBlank() }
                    ?: json.optString("error").takeIf { it.isNotBlank() }
                    ?: json.optString("code").takeIf { it.isNotBlank() }
            }.getOrNull()
            (parsedMessage ?: raw.take(240)).withRequestReference(this)
        } catch (_: Exception) {
            fallback.withRequestReference(this)
        }
    }

    // ============================================================
    // TAMBAL BAN & TOWING — Nearby Couriers
    // ============================================================
    
    suspend fun getNearbyCouriers(serviceSubType: String, lat: Double, lng: Double): Result<NearbyCouriersResponse> {
        return try {
            val response = apiService.getNearbyCouriers(
                mapOf(
                    "service_sub_type" to serviceSubType,
                    "lat" to lat,
                    "lng" to lng,
                    "radius_km" to 5.0
                )
            )
            if (response.isSuccessful && response.body() != null) {
                Result.success(response.body()!!)
            } else {
                Result.failure(Exception("Gagal memuat data petugas"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
    
    // ============================================================
    // TAMBAL BAN & TOWING — Service Reports
    // ============================================================
    
    suspend fun getTambalBanReport(orderId: String): Result<TambalBanReport> {
        return try {
            val response = apiService.getTambalBanReport(orderId)
            if (response.isSuccessful && response.body() != null) {
                Result.success(response.body()!!)
            } else {
                Result.failure(Exception("Gagal memuat laporan tambal ban"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
    
    suspend fun getTowingReport(orderId: String): Result<TowingReport> {
        return try {
            val response = apiService.getTowingReport(orderId)
            if (response.isSuccessful && response.body() != null) {
                Result.success(response.body()!!)
            } else {
                Result.failure(Exception("Gagal memuat laporan towing"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
    
    // ============================================================
    // TAMBAL BAN & TOWING — Settlement
    // ============================================================
    
    suspend fun calculateSettlement(
        orderId: String,
        serviceCode: String,
        grossTotal: Long,
        distanceKm: Double,
        baseFare: Long,
        perKmRate: Long,
        courierServicePrice: Long,
        tollCost: Long,
        insuranceFee: Long
    ): Result<SettlementResult> {
        return try {
            val response = apiService.calculateSettlement(
                orderId,
                mapOf(
                    "order_id" to orderId,
                    "service_code" to serviceCode,
                    "gross_total" to grossTotal,
                    "distance_km" to distanceKm,
                    "base_fare" to baseFare,
                    "per_km_rate" to perKmRate,
                    "courier_service_price" to courierServicePrice,
                    "toll_cost" to tollCost,
                    "insurance_fee" to insuranceFee
                )
            )
            if (response.isSuccessful && response.body() != null) {
                Result.success(response.body()!!)
            } else {
                Result.failure(Exception("Gagal menghitung settlement"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}

