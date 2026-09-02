package com.tembus.customer.data.repository

import com.tembus.customer.data.api.TEMBUSApiService
import com.tembus.customer.data.api.withRequestReference
import com.tembus.customer.data.api.withRecoverableNextAction
import com.tembus.customer.data.db.OrderDao
import com.tembus.customer.data.model.*
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flow
import java.util.UUID
import org.json.JSONObject
import retrofit2.Response
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class OrderRepository @Inject constructor(
    private val apiService: TEMBUSApiService,
    private val orderDao: OrderDao,
) {
    fun getOrderHistory(): Flow<Result<List<Order>>> = flow {
        val remote = refreshOrderHistoryFromServer()
        if (remote.isSuccess) {
            emit(remote)
            return@flow
        }

        // History tetap bisa dibaca saat tunnel/API sedang offline. Worker
        // memakai refreshOrderHistoryFromServer() langsung, jadi fallback ini
        // tidak mengubah kegagalan sinkronisasi menjadi sukses palsu.
        val cached = orderDao.getAllOrders().first()
        if (cached.isNotEmpty()) emit(Result.success(cached)) else emit(remote)
    }

    suspend fun refreshOrderHistoryFromServer(): Result<List<Order>> {
        return try {
            val response = apiService.getOrderHistory()
            if (response.isSuccessful && response.body()?.success == true) {
                val remoteOrders = response.body()?.data ?: emptyList()
                cacheRemoteOrders(remoteOrders)
                Result.success(remoteOrders)
            } else {
                Result.failure(Exception(response.readErrorMessage(response.body()?.message ?: "Gagal memuat riwayat pesanan")))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    private suspend fun cacheRemoteOrders(orders: List<Order>) {
        orders.forEach { remote ->
            val local = orderDao.getOrderById(remote.orderId)
            orderDao.upsert(remote.copy(localId = local?.localId ?: 0, needsSync = false))
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

    // FB-078: validasi kode voucher (preview diskon sebelum submit)
    suspend fun validateVoucher(code: String, baseIdr: Long, model: String = "p2p"): Result<VoucherValidateResponse> {
        return try {
            val response = apiService.validateVoucher(VoucherValidateRequest(code, baseIdr, model))
            val body = response.body()
            if (response.isSuccessful && body != null && body.valid) {
                Result.success(body)
            } else {
                Result.failure(Exception(body?.error ?: "Kode voucher tidak valid (${response.code()})"))
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

    class PriceConsentRequiredException(
        val deltaIdr: Long,
        val trustedPriceBreakdown: PriceBreakdown?
    ) : Exception("Harga towing berubah. Tinjau kenaikan lalu setujui untuk melanjutkan.")

    fun createCustomerOnDemandOrder(request: CustomerOrderCreateRequest, idempotencyKey: String = UUID.randomUUID().toString()): Flow<Result<CreatedCustomerOrder>> = flow {
        try {
            val response = apiService.createCustomerOnDemandOrder(idempotencyKey, request)
            val body = response.body()
            val order = body?.order
            if (response.isSuccessful && body?.success == true && order != null) {
                emit(Result.success(order))
            } else {
                if (body?.code == "REQUOTE_REQUIRED" || body?.requiresPriceConsent == true) {
                    emit(Result.failure(PriceConsentRequiredException(body.priceDeltaIdr, body.trustedPriceBreakdown)))
                    return@flow
                }
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

    suspend fun updateCustomerAddress(id: String, request: CustomerAddressRequest): Result<CustomerAddress> {
        return try {
            val response = apiService.updateCustomerAddress(id, request)
            val body = response.body()
            val address = body?.data
            if (response.isSuccessful && body?.success == true && address != null) {
                Result.success(address)
            } else {
                Result.failure(Exception(response.readErrorMessage(body?.message ?: "Gagal memperbarui alamat")))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun deleteCustomerAddress(id: String): Result<Unit> {
        return try {
            val response = apiService.deleteCustomerAddress(id)
            val body = response.body()
            if (response.isSuccessful && body?.success == true) {
                Result.success(Unit)
            } else {
                Result.failure(Exception(response.readErrorMessage(body?.message ?: "Gagal menghapus alamat")))
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
                        courierPhotoUrl = trackingOrder.courierPhotoUrl,
                        courierVehicle = trackingOrder.courierVehicle,
                        courierPlate = trackingOrder.courierPlate,
                        courierPhone = trackingOrder.courierPhone,
                        serviceSubType = trackingOrder.serviceSubType,
                        merchantName = trackingOrder.merchantName,
                        orderNotes = trackingOrder.orderNotes, // FB-121
                        foodItems = trackingOrder.foodItems
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

    fun createCustomerPaymentSession(orderId: String, paymentMethod: String, idempotencyKey: String = UUID.randomUUID().toString()): Flow<Result<CustomerPaymentSetup>> = flow {
        try {
            val response = apiService.createCustomerPaymentSession(
                orderId,
                idempotencyKey,
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

    suspend fun confirmCustomerPayment(orderId: String, idempotencyKey: String = UUID.randomUUID().toString()): Result<CustomerPaymentSetup> {
        return try {
            val response = apiService.confirmCustomerPayment(orderId, idempotencyKey)
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

    // ============================================================
    // FB-077: TIPS DRIVER — semua service (parcel/tambal/towing/food)
    // ============================================================

    /** Beri tip ke kurir (Rp1.000–Rp200.000, 1x per order). */
    suspend fun giveTip(orderId: String, amountIdr: Long): Result<TipCreateResponse> {
        return try {
            val response = apiService.createTip(orderId, CreateTipRequest(amountIdr))
            val body = response.body()
            if (response.isSuccessful && body?.success == true && body.data != null) {
                Result.success(body.data)
            } else {
                Result.failure(Exception(response.readErrorMessage(body?.message ?: "Gagal mengirim tip")))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    /** Cek apakah order sudah di-tip (untuk sembunyikan tombol tip). */
    suspend fun getTipStatus(orderId: String): Result<Boolean> {
        return try {
            val response = apiService.getTipStatus(orderId)
            val body = response.body()
            if (response.isSuccessful && body?.success == true && body.data != null) {
                Result.success(body.data.tipped)
            } else {
                Result.failure(Exception(response.readErrorMessage(body?.message ?: "Gagal cek status tip")))
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
                val message = json.optString("message").takeIf { it.isNotBlank() }
                    ?: json.optString("error").takeIf { it.isNotBlank() }
                    ?: json.optString("code").takeIf { it.isNotBlank() }
                message?.withRecoverableNextAction(json.optString("code").takeIf { it.isNotBlank() })
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
            val response = apiService.getNearbyCouriers(serviceSubType, lat, lng)
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
    // TAMBAL BAN — Home + Detail Teknisi + Search (design Stitch UI/UX)
    // ============================================================

    suspend fun getTambalBanHome(lat: Double, lng: Double): Result<TambalBanHomeResponse> {
        return try {
            val response = apiService.getTambalBanHome(lat, lng)
            if (response.isSuccessful && response.body() != null) {
                Result.success(response.body()!!)
            } else {
                Result.failure(Exception("Gagal memuat halaman tambal ban"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getTambalBanMaterials(serviceCode: String): Result<TambalBanMaterialsResponse> {
        return try {
            val response = apiService.getTambalBanMaterials(serviceCode)
            if (response.isSuccessful && response.body()?.success == true) {
                Result.success(response.body()!!)
            } else {
                Result.failure(Exception("Gagal memuat katalog material"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getCourierDetail(courierId: String, serviceSubType: String): Result<CourierDetail> {
        return try {
            val response = apiService.getCourierDetail(courierId, serviceSubType)
            if (response.isSuccessful && response.body() != null) {
                Result.success(response.body()!!)
            } else {
                Result.failure(Exception("Gagal memuat detail petugas"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun searchTambalBanCouriers(query: String, lat: Double, lng: Double, serviceSubType: String): Result<NearbyCouriersResponse> {
        return try {
            val response = apiService.searchTambalBanCouriers(lat, lng, query, serviceSubType)
            if (response.isSuccessful && response.body() != null) {
                Result.success(response.body()!!)
            } else {
                Result.failure(Exception("Gagal mencari petugas"))
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

        // ============================================================
        // FOOD-BIKE-070: Favorite Merchants (C3)
        // ============================================================

        suspend fun addFavoriteMerchant(merchantId: String): Result<FavoriteActionResponse> {
            return try {
                val response = apiService.addFavoriteMerchant(merchantId)
                val body = response.body()
                if (response.isSuccessful && body?.success == true) {
                    Result.success(body)
                } else {
                    Result.failure(Exception(response.readErrorMessage(body?.message ?: "Gagal menambahkan favorit")))
                }
            } catch (e: Exception) {
                Result.failure(e)
            }
        }

        suspend fun removeFavoriteMerchant(merchantId: String): Result<FavoriteActionResponse> {
            return try {
                val response = apiService.removeFavoriteMerchant(merchantId)
                val body = response.body()
                if (response.isSuccessful && body?.success == true) {
                    Result.success(body)
                } else {
                    Result.failure(Exception(response.readErrorMessage(body?.message ?: "Gagal menghapus favorit")))
                }
            } catch (e: Exception) {
                Result.failure(e)
            }
        }

        suspend fun listFavoriteMerchants(): Result<List<FavoriteMerchant>> {
            return try {
                val response = apiService.listFavoriteMerchants()
                val body = response.body()
                if (response.isSuccessful && body?.merchants != null) {
                    Result.success(body.merchants)
                } else {
                    Result.failure(Exception(response.readErrorMessage("Gagal memuat daftar favorit")))
                }
            } catch (e: Exception) {
                Result.failure(e)
            }
        }

        suspend fun getBanners(): Result<List<GlobalBanner>> {
            return try {
                val response = apiService.getBanners()
                val body = response.body()
                if (response.isSuccessful && body != null) {
                    Result.success(body.banners)
                } else {
                    Result.failure(Exception(response.readErrorMessage("Gagal memuat banner")))
                }
            } catch (e: Exception) {
                Result.failure(e)
            }
        }

        suspend fun checkIsFavoriteMerchant(merchantId: String): Result<Boolean> {
            return try {
                val response = apiService.checkIsFavoriteMerchant(merchantId)
                val body = response.body()
                if (response.isSuccessful && body != null) {
                    Result.success(body.isFavorite)
                } else {
                    Result.failure(Exception(response.readErrorMessage("Gagal cek status favorit")))
                }
            } catch (e: Exception) {
                Result.failure(e)
            }
        }
    }
