package com.lancar.customer.data.api

import com.lancar.customer.data.model.*
import retrofit2.Response
import retrofit2.http.*

interface LANCARApiService {

    // Auth Endpoints
    @POST("auth/customer/otp-request")
    suspend fun requestOtp(@Body request: OtpRequest): Response<AuthResponse>

    @POST("auth/customer/login")
    suspend fun login(@Body request: LoginRequest): Response<AuthResponse>

    // Tracking Endpoints
    @GET("api/v1/tracking")
    suspend fun getTracking(
        @Query("order_id") orderId: String
    ): Response<ApiResponse<TrackingResponse>>

    // Order Endpoints
    @GET("api/v1/orders")
    suspend fun getOrderHistory(): Response<ApiResponse<List<Order>>>

    @GET("api/v1/orders/{id}")
    suspend fun getOrderDetail(
        @Path("id") id: String
    ): Response<ApiResponse<Order>>

    @POST("api/v1/orders")
    suspend fun createOrder(
        @Body request: CreateOrderRequest
    ): Response<ApiResponse<Order>>

    @POST("api/v1/orders/{id}/cancel")
    suspend fun cancelOrder(
        @Path("id") id: String
    ): Response<ApiResponse<Unit>>

    // Payment Endpoints
    @POST("api/v1/orders/{id}/payment")
    suspend fun initiatePayment(
        @Path("id") id: String,
        @Body request: PaymentRequest
    ): Response<ApiResponse<PaymentResponse>>

    // Profile Endpoints
    @GET("api/v1/profile")
    suspend fun getProfile(): Response<ApiResponse<ProfileResponse>>

    @PUT("api/v1/profile")
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

    // Notification Endpoints
    @POST("api/v1/mobile/notifications/register-token")
    suspend fun registerDeviceToken(
        @Body request: RegisterTokenRequest
    ): Response<Unit>
}
