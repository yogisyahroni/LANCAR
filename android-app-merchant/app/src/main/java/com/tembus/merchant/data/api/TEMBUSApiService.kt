package com.tembus.merchant.data.api

import com.tembus.merchant.data.model.*
import okhttp3.MultipartBody
import retrofit2.Response
import retrofit2.http.*

/**
 * TEMBUS Merchant API — semua endpoint merchant-service yang sudah LIVE di staging.
 * Base URL dari BuildConfig (gateway: api.bawain.my.id/api/v1).
 */
interface TEMBUSApiService {

    // ── System (auto-update) ──
    @GET("api/v1/system/latest-version")
    suspend fun getLatestVersion(
        @Query("type") type: String
    ): Response<AppVersion>

    // ── Auth (auth-service, generic untuk semua role) ──
    @POST("api/v1/auth/customer/login/start")
    suspend fun login(
        @Body body: LoginRequest
    ): Response<AuthResponse>

    /** Auto-refresh token saat 401 (ADR-004) — tanpa JWT, dipanggil TokenAuthenticator. */
    @POST("api/v1/auth/refresh")
    suspend fun refreshToken(
        @Body body: RefreshTokenRequest
    ): Response<AuthResponse>

    // ── Merchant profile ──
    @GET("api/v1/merchant/profile")
    suspend fun getProfile(): Response<Merchant>

    // FB-109: update profil (minimal order value, dll).
    @PATCH("api/v1/merchant/profile")
    suspend fun updateProfile(
        @Body request: UpdateProfileRequest
    ): Response<Merchant>

    @GET("api/v1/merchant/operating-hours")
    suspend fun getOperatingHours(): Response<MerchantOperatingHoursResponse>

    @PUT("api/v1/merchant/operating-hours")
    suspend fun replaceOperatingHours(
        @Body request: ReplaceOperatingHoursRequest
    ): Response<MerchantOperatingHoursResponse>

    @POST("api/v1/merchant/operating-hours/closures")
    suspend fun createSpecialClosure(
        @Body request: CreateSpecialClosureRequest
    ): Response<MerchantSpecialClosure>

    @DELETE("api/v1/merchant/operating-hours/closures/{id}")
    suspend fun deleteSpecialClosure(
        @Path("id") id: String
    ): Response<SuccessResponse>

    @POST("api/v1/merchant/register")
    suspend fun registerMerchant(
        @Body request: RegisterMerchantRequest
    ): Response<Merchant>

    @POST("api/v1/merchant/toggle-open")
    suspend fun toggleOpen(
        @Body request: ToggleOpenRequest
    ): Response<Merchant>

    // FB-107: pause sementara + resume — tidak mengubah is_open/jam operasional.
    @POST("api/v1/merchant/pause")
    suspend fun pause(
        @Body request: PauseRequest
    ): Response<Merchant>

    @POST("api/v1/merchant/resume")
    suspend fun resume(): Response<Merchant>

    @PUT("api/v1/merchant/food-docs")
    suspend fun updateFoodDocs(
        @Body request: UpdateFoodDocsRequest
    ): Response<Merchant>

    // FB-114: update rekening bank (payout).
    @PUT("api/v1/merchant/bank-account")
    suspend fun updateBankAccount(
        @Body request: UpdateBankAccountRequest
    ): Response<Merchant>

    // ── Menu CRUD ──
    // FB-110: upload foto menu (multipart → URL publik)
    @Multipart
    @POST("api/v1/merchant/menu/upload")
    suspend fun uploadMenuPhoto(
        @Part file: MultipartBody.Part
    ): Response<UploadMenuPhotoResponse>

    // FB-045: upload dokumen registrasi generic (KTP/foto toko/rekening)
    @Multipart
    @POST("api/v1/merchant/upload")
    suspend fun uploadDoc(
        @Part file: MultipartBody.Part
    ): Response<UploadMenuPhotoResponse>

    @GET("api/v1/merchant/menu")
    suspend fun listMenu(
        @Query("page") page: Int = 1,
        @Query("page_size") pageSize: Int = 50
    ): Response<MenuListResponse>

    @POST("api/v1/merchant/menu")
    suspend fun createMenuItem(
        @Body request: MenuItemRequest
    ): Response<MenuItem>

    @PATCH("api/v1/merchant/menu/{id}")
    suspend fun updateMenuItem(
        @Path("id") id: String,
        @Body request: MenuItemRequest
    ): Response<MenuItem>

    @DELETE("api/v1/merchant/menu/{id}")
    suspend fun deleteMenuItem(
        @Path("id") id: String
    ): Response<SuccessResponse>

    @POST("api/v1/merchant/menu/{id}/availability")
    suspend fun setMenuItemAvailability(
        @Path("id") id: String,
        @Body request: AvailabilityRequest
    ): Response<MenuItem>

    // ── FB-108: varian menu ────────────────────────────────────────────
    @GET("api/v1/merchant/menu/{id}/variants")
    suspend fun getMenuItemVariants(
        @Path("id") id: String
    ): Response<List<MenuItemVariant>>

    @PUT("api/v1/merchant/menu/{id}/variants")
    suspend fun replaceMenuItemVariants(
        @Path("id") id: String,
        @Body request: ReplaceVariantsRequest
    ): Response<List<MenuItemVariant>>

    // ── Orders ──
    @GET("api/v1/merchant/orders")
    suspend fun listOrders(
        @Query("status") status: String? = null,
        @Query("page") page: Int = 1,
        @Query("page_size") pageSize: Int = 20
    ): Response<OrderListResponse>

    @POST("api/v1/merchant/orders/{id}/accept")
    suspend fun acceptOrder(
        @Path("id") id: String
    ): Response<SuccessResponse>

    // FB-125: tandai pesanan siap (masak selesai) → mulai cari kurir.
    @POST("api/v1/merchant/orders/{id}/ready")
    suspend fun markReady(
        @Path("id") id: String
    ): Response<SuccessResponse>

    @POST("api/v1/merchant/orders/{id}/reject")
    suspend fun rejectOrder(
        @Path("id") id: String,
        @Body request: RejectOrderRequest
    ): Response<SuccessResponse>

    // ── FB-087: Edit order items ──
    @GET("api/v1/merchant/orders/{id}/items")
    suspend fun getOrderEdit(
        @Path("id") id: String
    ): Response<OrderEditData>

    @PUT("api/v1/merchant/orders/{id}/items")
    suspend fun editOrderItems(
        @Path("id") id: String,
        @Body request: EditOrderItemsRequest
    ): Response<EditOrderResult>

    @POST("api/v1/merchant/orders/{id}/items/unavailable")
    suspend fun partialRejectOrder(
        @Path("id") id: String,
        @Body request: PartialRejectOrderRequest
    ): Response<PartialRejectResult>

    // ── Struk ──
    @GET("api/v1/merchant/orders/{id}/struk")
    suspend fun getStruk(
        @Path("id") id: String
    ): Response<StrukData>

    // ── Laporan penjualan (FB-086) ──
    @GET("api/v1/merchant/reports")
    suspend fun getSalesReport(
        @Query("period") period: String
    ): Response<SalesReportSummary>

    // Review customer merchant dari merchant_ratings (tanpa data kontak).
    @GET("api/v1/merchant/reviews")
    suspend fun getCustomerReviews(
        @Query("page") page: Int = 1,
        @Query("page_size") pageSize: Int = 20
    ): Response<MerchantReviewsResponse>

    @POST("api/v1/merchant/reviews/{id}/reply")
    suspend fun replyToCustomerReview(
        @Path("id") reviewId: String,
        @Body request: MerchantReviewReplyRequest
    ): Response<MerchantReviewReply>

    // FB-113: riwayat pencairan/payout merchant.
    @GET("api/v1/merchant/settlements")
    suspend fun getSettlements(): Response<SettlementSummary>

    // M7: ajukan pencairan saldo merchant.
    @POST("api/v1/merchant/withdraw")
    suspend fun requestWithdrawal(
        @Body request: MerchantWithdrawalRequest
    ): Response<Map<String, @JvmSuppressWildcards Any>>

    // M7: riwayat permintaan pencairan merchant.
    @GET("api/v1/merchant/withdrawals")
    suspend fun getWithdrawals(): Response<List<MerchantWithdrawalRecord>>

    // Merchant inbox memakai notification service yang sama dengan customer.
    @GET("api/v1/notifications")
    suspend fun getNotifications(
        @Query("limit") limit: Int = 50,
        @Query("offset") offset: Int = 0
    ): Response<NotificationListResponse>

    @PATCH("api/v1/notifications/read")
    suspend fun markNotificationRead(
        @Body request: MarkNotificationReadRequest
    ): Response<SuccessResponse>

    @GET("api/v1/notifications/preferences")
    suspend fun getNotificationPreferences(): Response<NotificationPreferencesResponse>

    @PATCH("api/v1/notifications/preferences")
    suspend fun updateNotificationPreferences(
        @Body request: UpdateNotificationPreferencesRequest
    ): Response<NotificationPreferencesResponse>

    // ── Promo merchant (FB-099/100): self-serve, tanpa approval admin ──
    @GET("api/v1/merchant/promos")
    suspend fun listPromos(
        @Query("page") page: Int = 1,
        @Query("page_size") pageSize: Int = 50
    ): Response<PromoListResponse>

    @POST("api/v1/merchant/promos")
    suspend fun createPromo(
        @Body request: MerchantPromoRequest
    ): Response<MerchantPromo>

    @PATCH("api/v1/merchant/promos/{id}")
    suspend fun updatePromo(
        @Path("id") id: String,
        @Body request: MerchantPromoRequest
    ): Response<MerchantPromo>

    @DELETE("api/v1/merchant/promos/{id}")
    suspend fun deletePromo(
        @Path("id") id: String
    ): Response<SuccessResponse>

    @POST("api/v1/merchant/promos/{id}/active")
    suspend fun setPromoActive(
        @Path("id") id: String,
        @Body request: PromoActiveRequest
    ): Response<SuccessResponse>

    // ── Chat order (FB-119): merchant ↔ customer ──
    // Endpoint sama dengan customer/courier — backend mengizinkan
    // role 'merchant' via orderCommunication.ts (member_type 'merchant').
    @GET("api/v1/mobile/chats/orders/{id}/chats")
    suspend fun getOrderChats(
        @Path("id") orderId: String
    ): Response<ChatResponse>

    @POST("api/v1/mobile/chats/orders/{id}/chats")
    suspend fun sendOrderChat(
        @Path("id") orderId: String,
        @Body request: SendMessageRequest
    ): Response<SendMessageResponse>

    @PATCH("api/v1/mobile/chats/orders/{id}/conversation/read")
    suspend fun markOrderConversationRead(
        @Path("id") orderId: String,
        @Body request: ReadReceiptRequest
    ): Response<SuccessResponse>

    // ── M1: Staff Management (CORPORATE ONLY) ──
    // NOTE: path diubah ke /merchant/staff/{id} (Go 1.22+ ServeMux conflict fix).
    @POST("api/v1/merchant/staff/{id}")
    suspend fun inviteStaff(
        @Path("id") merchantId: String,
        @Body request: InviteStaffRequest
    ): Response<InviteStaffResponse>

    @GET("api/v1/merchant/staff/{id}")
    suspend fun listStaff(
        @Path("id") merchantId: String
    ): Response<StaffListResponse>

    @POST("api/v1/merchant/staff/accept")
    suspend fun acceptStaffInvite(
        @Body request: AcceptStaffInviteRequest
    ): Response<SuccessResponse>

    @PATCH("api/v1/merchant/staff/{id}/{staffId}")
    suspend fun updateStaff(
        @Path("id") merchantId: String,
        @Path("staffId") staffId: String,
        @Body request: UpdateStaffRequest
    ): Response<StaffListResponse>
}
