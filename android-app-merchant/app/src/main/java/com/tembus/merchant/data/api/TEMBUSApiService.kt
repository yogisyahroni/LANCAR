package com.tembus.merchant.data.api

import com.tembus.merchant.data.model.*
import retrofit2.Response
import retrofit2.http.*

/**
 * TEMBUS Merchant API — semua endpoint merchant-service yang sudah LIVE di staging.
 * Base URL dari BuildConfig (gateway: api.bawain.my.id/api/v1).
 */
interface TEMBUSApiService {

    // ── Auth (auth-service, generic untuk semua role) ──
    @POST("api/v1/auth/customer/login/start")
    suspend fun login(
        @Body request: LoginRequest
    ): Response<AuthResponse>

    // ── Merchant profile ──
    @GET("api/v1/merchant/profile")
    suspend fun getProfile(): Response<Merchant>

    // FB-109: update profil (minimal order value, dll).
    @PATCH("api/v1/merchant/profile")
    suspend fun updateProfile(
        @Body request: UpdateProfileRequest
    ): Response<Merchant>

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

    @POST("api/v1/merchant/orders/{id}/reject")
    suspend fun rejectOrder(
        @Path("id") id: String,
        @Body request: RejectOrderRequest
    ): Response<SuccessResponse>

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

    // FB-113: riwayat pencairan/payout merchant.
    @GET("api/v1/merchant/settlements")
    suspend fun getSettlements(): Response<SettlementSummary>

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
}
