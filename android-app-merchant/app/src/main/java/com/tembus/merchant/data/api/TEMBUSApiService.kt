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

    @POST("api/v1/merchant/register")
    suspend fun registerMerchant(
        @Body request: RegisterMerchantRequest
    ): Response<Merchant>

    @POST("api/v1/merchant/toggle-open")
    suspend fun toggleOpen(
        @Body request: ToggleOpenRequest
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
}
