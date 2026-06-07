package com.tembus.customer.data.api

import com.tembus.customer.data.model.*
import retrofit2.Response
import retrofit2.http.*

interface TEMBUSApiService {
    
    // System Endpoints
    @GET("api/v1/system/latest-version")
    suspend fun getLatestVersion(
        @Query("type") type: String
    ): Response<AppVersion>

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
}
