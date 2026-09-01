package com.tembus.customer.data.api

import com.tembus.customer.data.model.*
import kotlinx.serialization.json.JsonElement
import retrofit2.Response
import retrofit2.http.*

interface TEMBUSApiService {

    // System Endpoints
    @GET("api/v1/system/latest-version")
    suspend fun getLatestVersion(
        @Query("type") type: String
    ): Response<AppVersion>

    @GET("api/v1/mobile/feature-flags")
    suspend fun getFeatureFlags(): Response<JsonElement>

    @GET("api/v1/maps/config")
    suspend fun getMapsProviderConfig(
        @Query("scope") scope: String = "customer_mobile"
    ): Response<MapsProviderConfig>

    @GET("api/v1/maps/geocode")
    suspend fun geocodeAddress(
        @Query("query") query: String,
        @Query("scope") scope: String = "customer_mobile"
    ): Response<MapsGeocodeResponse>

    @GET("api/v1/maps/reverse-geocode")
    suspend fun reverseGeocodePoint(
        @Query("latitude") latitude: Double,
        @Query("longitude") longitude: Double,
        @Query("scope") scope: String = "customer_mobile"
    ): Response<MapsReverseGeocodeResponse>


    // Auth Endpoints

    @POST("api/v1/auth/otp/send")
    suspend fun requestOtpV1(@Body request: OtpV1Request): Response<AuthResponse>

    @POST("api/v1/auth/otp/verify")
    suspend fun loginV1(@Body request: LoginV1Request): Response<AuthResponse>

    @POST("api/v1/auth/customer/login/start")
    suspend fun startCustomerPasswordLogin(
        @Body request: CustomerPasswordLoginStartRequest
    ): Response<AuthResponse>

    @POST("api/v1/auth/customer/register/start")
    suspend fun startCustomerPasswordRegistration(
        @Body request: CustomerPasswordRegisterStartRequest
    ): Response<AuthResponse>

    @POST("api/v1/auth/password-reset/request")
    suspend fun requestPasswordReset(
        @Body request: PasswordResetRequest
    ): Response<PasswordResetResponse>

    @POST("api/v1/auth/password-reset/confirm")
    suspend fun confirmPasswordReset(
        @Body request: PasswordResetConfirmRequest
    ): Response<PasswordResetResponse>

    @POST("api/v1/auth/customer/google/start")
    suspend fun startGoogleAuth(
        @Body request: GoogleAuthStartRequest
    ): Response<GoogleAuthStartResponse>

    @POST("api/v1/auth/customer/google/complete")
    suspend fun completeGoogleAuth(
        @Body request: GoogleAuthCompleteRequest
    ): Response<GoogleAuthCompleteResponse>

    @POST("api/v1/auth/customer/otp/send")
    suspend fun sendCustomerOtp(
        @Body request: CustomerOtpSendRequest
    ): Response<CustomerOtpSendResponse>

    @POST("api/v1/auth/customer/otp/verify")
    suspend fun verifyCustomerOtp(
        @Body request: CustomerOtpVerifyRequest
    ): Response<CustomerOtpVerifyResponse>

    // Tracking Endpoints
    @GET("api/v1/tracking")
    suspend fun getTracking(
        @Query("order_id") orderId: String
    ): Response<ApiResponse<TrackingResponse>>

    // Order Endpoints
    @GET("api/v1/customer/orders")
    suspend fun getOrderHistory(): Response<ApiResponse<List<Order>>>

    @GET("api/v1/customer/incoming-packages")
    suspend fun getIncomingPackages(
        @Query("limit") limit: Int = 20
    ): Response<ApiResponse<List<Order>>>

    @GET("api/v1/customer/orders/{id}")
    suspend fun getOrderDetail(
        @Path("id") id: String
    ): Response<ApiResponse<Order>>

    @GET("api/v1/customer/orders/{id}/tracking-detail")
    suspend fun getOrderTrackingDetail(
        @Path("id") id: String
    ): Response<OrderTrackingDetailResponse>

    @GET("api/v1/customer/delivery-services")
    suspend fun getCustomerDeliveryServices(): Response<DeliveryServicesResponse>

    @POST("api/v1/customer/orders/calculate")
    suspend fun calculateCustomerOrderPrice(
        @Body request: CustomerPriceEstimateRequest
    ): Response<PriceBreakdown>

    @POST("api/v1/customer/orders/calculate-all")
    suspend fun calculateCustomerOrderPrices(
        @Body request: CustomerPriceEstimateRequest
    ): Response<CustomerBulkPriceEstimateResponse>

    @POST("api/v1/customer/orders")
    suspend fun createCustomerOnDemandOrder(
        @Body request: CustomerOrderCreateRequest
    ): Response<CustomerOrderCreateResponse>

    @POST("api/v1/customer/orders/{id}/cancel")
    suspend fun cancelCustomerOrder(
        @Path("id") id: String,
        @Body request: Map<String, String>
    ): Response<ApiResponse<Unit>>

    @POST("api/v1/customer/orders/{id}/retry-matching")
    suspend fun retryCustomerOrderMatching(
        @Path("id") id: String
    ): Response<ApiResponse<Unit>>

    /**
     * Submit rating (1-5 bintang) dari customer ke kurir.
     * Hanya bisa dilakukan untuk order berstatus 'delivered' dan belum di-rating.
     * Backend memvalidasi ownership via JWT — tidak perlu kirim customer_id di body.
     */
    @POST("api/v1/customer/orders/{id}/rating")
    suspend fun submitCourierRating(
        @Path("id") id: String,
        @Body request: SubmitRatingRequest
    ): Response<RatingSubmitResponse>

    /**
     * Submit rating (1-5 bintang) untuk merchant (makanan) — FOOD-BIKE-060.
     * Terpisah dari rating driver. Backend memvalidasi ownership via JWT.
     */
    @POST("api/v1/customer/orders/{id}/merchant-rating")
    suspend fun submitMerchantRating(
        @Path("id") id: String,
        @Body request: SubmitRatingRequest
    ): Response<RatingSubmitResponse>

    /**
     * Ambil list order yang menunggu rating dari customer yang sedang login.
     * Dipakai untuk menampilkan reminder rating di NotificationCenter dan TrackingScreen.
     * Filter backend: status=delivered, courier_rating IS NULL, reminder_count < 4,
     * last_rating_reminder_at >= 12 jam lalu.
     */
    @GET("api/v1/customer/rating-reminders")
    suspend fun getRatingReminders(): Response<RatingReminderListResponse>

    // ============================================================
    // FB-077: TIPS DRIVER — semua service (parcel/tambal/towing/food)
    // ============================================================

    /**
     * Beri tip ke kurir (Rp1.000–Rp200.000, 1x per order).
     * Berjalan untuk order berstatus accepted → delivered.
     */
    @POST("api/v1/orders/{id}/tips")
    suspend fun createTip(
        @Path("id") id: String,
        @Body request: CreateTipRequest
    ): Response<ApiResponse<TipCreateResponse>>

    /**
     * Cek apakah order sudah di-tip (untuk menyembunyikan tombol saat sudah tip).
     */
    @GET("api/v1/orders/{id}/tip")
    suspend fun getTipStatus(
        @Path("id") id: String
    ): Response<ApiResponse<TipStatusResponse>>

    // ============================================================
    // FB-078: VOUCHER REDEEM — preview diskon sebelum checkout
    // ============================================================

    @POST("api/v1/vouchers/validate")
    suspend fun validateVoucher(
        @Body request: VoucherValidateRequest
    ): Response<VoucherValidateResponse>

    @GET("api/v1/customer/addresses")
    suspend fun getCustomerAddresses(
        @Query("kind") kind: String? = null
    ): Response<CustomerAddressListResponse>

    @POST("api/v1/customer/addresses")
    suspend fun createCustomerAddress(
        @Body request: CustomerAddressRequest
    ): Response<CustomerAddressResponse>

    @PATCH("api/v1/customer/addresses/{id}")
    suspend fun updateCustomerAddress(
        @Path("id") id: String,
        @Body request: CustomerAddressRequest
    ): Response<CustomerAddressResponse>

    @DELETE("api/v1/customer/addresses/{id}")
    suspend fun deleteCustomerAddress(
        @Path("id") id: String
    ): Response<CustomerAddressResponse>

    @POST("api/v1/customer/location-requests")
    suspend fun createReceiverLocationRequest(
        @Body request: ReceiverLocationCreateRequest
    ): Response<ReceiverLocationRequestResponse>

    @GET("api/v1/customer/location-requests/{id}")
    suspend fun getReceiverLocationRequest(
        @Path("id") id: String
    ): Response<ReceiverLocationRequestResponse>

    @DELETE("api/v1/customer/location-requests/{id}")
    suspend fun revokeReceiverLocationRequest(
        @Path("id") id: String
    ): Response<ReceiverLocationRequestResponse>

    // Payment Endpoints
    @POST("api/v1/customer/orders/{id}/payment")
    suspend fun createCustomerPaymentSession(
        @Path("id") id: String,
        @Body request: CustomerPaymentCreateRequest
    ): Response<CustomerPaymentSessionResponse>

    @GET("api/v1/customer/orders/{id}/payment/status")
    suspend fun getCustomerPaymentStatus(
        @Path("id") id: String
    ): Response<CustomerPaymentSessionResponse>

    @POST("api/v1/customer/orders/{id}/payment/check")
    suspend fun confirmCustomerPayment(
        @Path("id") id: String
    ): Response<CustomerPaymentSessionResponse>

    // Profile Endpoints
    @GET("api/v1/customer/referral")
    suspend fun getReferralInfo(): Response<ReferralInfoResponse>

    @POST("api/v1/customer/referral/apply")
    suspend fun applyReferralCode(
        @Body request: ApplyReferralRequest
    ): Response<ApplyReferralResponse>

    @GET("api/v1/customer/loyalty")
    suspend fun getLoyaltyInfo(): Response<LoyaltyInfoResponse>

    @GET("api/v1/customer/profile")
    suspend fun getProfile(): Response<ApiResponse<ProfileResponse>>

    @PUT("api/v1/customer/profile")
    suspend fun updateProfile(
        @Body request: UpdateProfileRequest
    ): Response<ApiResponse<ProfileResponse>>

    // Real-Time In-App Chat Sync (Mobile API Bridge)
    @GET("api/v1/mobile/chats/orders/{id}/chats")
    suspend fun getOrderChats(
        @Path("id") id: String
    ): Response<ChatResponse>

    @POST("api/v1/mobile/chats/orders/{id}/chats")
    suspend fun sendOrderChat(
        @Path("id") id: String,
        @Body request: SendMessageRequest
    ): Response<SendMessageResponse>

    @GET("api/v1/mobile/orders/{id}/conversation")
    suspend fun getOrderConversation(
        @Path("id") id: String
    ): Response<ChatResponse>

    @PATCH("api/v1/mobile/orders/{id}/conversation/read")
    suspend fun markOrderConversationRead(
        @Path("id") id: String,
        @Body request: ReadReceiptRequest
    ): Response<ReadReceiptResponse>

    @POST("api/v1/mobile/orders/{id}/calls")
    suspend fun createOrderCall(
        @Path("id") id: String,
        @Body request: CreateCallRequest
    ): Response<CallResponse>

    @POST("api/v1/mobile/orders/{id}/calls/{callId}/join")
    suspend fun joinOrderCall(
        @Path("id") id: String,
        @Path("callId") callId: String,
        @Body request: JoinCallRequest
    ): Response<CallResponse>

    @POST("api/v1/mobile/orders/{id}/calls/{callId}/end")
    suspend fun endOrderCall(
        @Path("id") id: String,
        @Path("callId") callId: String,
        @Body request: EndCallRequest
    ): Response<CallResponse>

    // Notification Endpoints
    @GET("api/v1/mobile/notifications")
    suspend fun getNotifications(
        @Query("category") category: String? = null,
        @Query("limit") limit: Int = 50
    ): Response<NotificationListResponse>

    @GET("api/v1/mobile/notifications/unread-count")
    suspend fun getNotificationUnreadCount(): Response<NotificationUnreadCountResponse>

    @PATCH("api/v1/mobile/notifications/{id}/read")
    suspend fun markNotificationRead(
        @Path("id") id: String
    ): Response<NotificationUpdateResponse>

    @PATCH("api/v1/mobile/notifications/read-all")
    suspend fun markAllNotificationsRead(
        @Body body: Map<String, String?> = emptyMap()
    ): Response<NotificationUpdateResponse>

    @PATCH("api/v1/mobile/notifications/{id}/archive")
    suspend fun archiveNotification(
        @Path("id") id: String
    ): Response<NotificationUpdateResponse>

    @POST("api/v1/customer/notifications/register-token")
    suspend fun registerDeviceToken(
        @Body request: RegisterTokenRequest
    ): Response<Unit>

    // Dispute Endpoints
    @Multipart
    @POST("api/v1/customer/orders/{id}/upload")
    suspend fun uploadDisputeEvidence(
        @Path("id") orderId: String,
        @Part file: okhttp3.MultipartBody.Part
    ): Response<UploadResponse>

    @POST("api/v1/customer/disputes")
    suspend fun createCustomerDispute(
        @Body request: CreateDisputeRequest
    ): Response<CustomerDisputeResponse>

    @GET("api/v1/auth/presign")
    suspend fun getPresignUrl(
        @Query("filename") filename: String,
        @Query("contentType") contentType: String
    ): Response<PresignResponse>

    @POST("api/v1/payment-links")
    suspend fun createPaymentLink(
        @Header("X-User-ID") merchantId: String,
        @Body request: Map<String, @JvmSuppressWildcards Any>
    ): Response<com.tembus.customer.data.model.ApiResponse<com.tembus.customer.ui.screens.business.PaymentLinkResponse>>

    // ─── Wallet: Tarik Dana (Withdraw) ─────────────────────────────────────────
    /**
     * Endpoint tarik dana customer ke rekening bank.
     *
     * KEAMANAN:
     * - Header Idempotency-Key wajib diisi dengan UUID v4 (mencegah double-submit)
     * - Body menggunakan WithdrawRequest yang sudah divalidasi di client
     * - Backend melakukan validasi ulang (defense-in-depth / zero-trust)
     * - Response HTTP 202 Accepted (proses async) atau 4xx jika validasi gagal
     */
    @POST("api/v1/payment/wallet/withdraw")
    suspend fun requestWithdraw(
        @Header("Idempotency-Key") idempotencyKey: String,
        @Body request: WithdrawRequest
    ): Response<ApiResponse<WithdrawResponse>>

    // ============================================================
    // TAMBAL BAN & TOWING — Nearby Couriers
    // ============================================================
    
    @GET("api/v1/customer/nearby-couriers")
    suspend fun getNearbyCouriers(
        @Query("service_sub_type") serviceSubType: String,
        @Query("lat") lat: Double,
        @Query("lng") lng: Double,
        @Query("radius_km") radiusKm: Double = 5.0
    ): Response<NearbyCouriersResponse>

    // ============================================================
    // TAMBAL BAN — Home + Detail Teknisi + Search (design Stitch UI/UX)
    // ============================================================

    @GET("api/v1/customer/tambal-ban/home")
    suspend fun getTambalBanHome(
        @Query("lat") lat: Double,
        @Query("lng") lng: Double
    ): Response<TambalBanHomeResponse>

    @GET("api/v1/customer/tambal-ban/materials")
    suspend fun getTambalBanMaterials(
        @Query("service_code") serviceCode: String
    ): Response<TambalBanMaterialsResponse>

    @GET("api/v1/customer/couriers/{id}")
    suspend fun getCourierDetail(
        @Path("id") courierId: String,
        @Query("service_sub_type") serviceSubType: String
    ): Response<CourierDetail>

    @GET("api/v1/customer/tambal-ban/search")
    suspend fun searchTambalBanCouriers(
        @Query("lat") lat: Double,
        @Query("lng") lng: Double,
        @Query("q") query: String,
        @Query("service_sub_type") serviceSubType: String
    ): Response<NearbyCouriersResponse>
    
    // ============================================================
    // TAMBAL BAN & TOWING — Service Reports
    // ============================================================
    
    @GET("api/v1/customer/orders/{orderId}/report/tambal-ban")
    suspend fun getTambalBanReport(@Path("orderId") orderId: String): Response<TambalBanReport>
    
    @GET("api/v1/customer/orders/{orderId}/report/towing")
    suspend fun getTowingReport(@Path("orderId") orderId: String): Response<TowingReport>
    
    // ============================================================
    // TAMBAL BAN & TOWING — Settlement
    // ============================================================
    
    @POST("api/v1/order/{orderId}/settlement")
    suspend fun calculateSettlement(@Path("orderId") orderId: String, @Body request: Map<String, Any>): Response<SettlementResult>

    // ============================================================
    // FOOD DELIVERY — Browse merchant, detail, cart, checkout (FOOD-BIKE-055/056/057/075)
    // ============================================================

    @GET("api/v1/food/merchants")
    suspend fun listFoodMerchants(
        @Query("lat") lat: Double,
        @Query("lng") lng: Double,
        @Query("search") search: String? = null,
        // ADR 003: filter halal — all (default) | halal_certified | non_halal
        @Query("halal") halal: String? = null
    ): Response<FoodMerchantListResponse>

    @GET("api/v1/food/merchants/{id}")
    suspend fun getFoodMerchantDetail(
        @Path("id") id: String
    ): Response<FoodMerchantDetailResponse>

    @POST("api/v1/orders/food")
    suspend fun createFoodOrder(
        @Body request: CreateFoodOrderRequest
    ): Response<FoodOrderCreateResponse>

    // FB-084 REORDER: validasi ulang item order food lama (harga + availability)
    @GET("api/v1/orders/reorder-info")
    suspend fun getReorderInfo(
        @Query("id") orderId: String
    ): Response<ReorderInfoResponse>

    // ============================================================
    // FOOD-BIKE-070: Favorite Merchants (C3)
    // ============================================================

    @POST("api/v1/food/favorites/{id}")
    suspend fun addFavoriteMerchant(
        @Path("id") merchantId: String
    ): Response<FavoriteActionResponse>

    @DELETE("api/v1/food/favorites/{id}")
    suspend fun removeFavoriteMerchant(
        @Path("id") merchantId: String
    ): Response<FavoriteActionResponse>

    @GET("api/v1/food/favorites")
    suspend fun listFavoriteMerchants(): Response<FavoriteMerchantsResponse>

    @GET("api/v1/food/favorites/check/{id}")
    suspend fun checkIsFavoriteMerchant(
        @Path("id") merchantId: String
    ): Response<FavoriteCheckResponse>

    // A4: global banner (pengumuman in-app platform-wide).
    @GET("api/v1/customer/banners")
    suspend fun getBanners(): Response<GlobalBannerListResponse>
}

