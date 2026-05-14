package com.lancar.courier.data.api

import com.lancar.courier.data.model.AppVersion
import com.lancar.courier.data.model.ApiResponse

import com.lancar.courier.data.model.CourierProfile
import com.lancar.courier.data.model.FCMTokenRequest
import com.lancar.courier.data.model.LocationRequest
import com.lancar.courier.data.model.LocationResponse
import com.lancar.courier.data.model.LoginData
import com.lancar.courier.data.model.LoginRequest
import com.lancar.courier.data.model.Order
import com.lancar.courier.data.model.ScanRequest
import com.lancar.courier.data.model.ScanResponse
import com.lancar.courier.data.model.StatusUpdateRequest
import com.lancar.courier.data.model.ChatResponse
import com.lancar.courier.data.model.SendMessageRequest
import com.lancar.courier.data.model.SendMessageResponse
import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.Response
import retrofit2.http.*

/**
 * LANCAR API Service Interface
 *
 * Retrofit interface for backend API calls.
 * Handles auth, FCM token registration, order operations, and location sync.
 */
interface LANCARApiService {
    
    // ── SYSTEM ──────────────────────────────────────────────────
    
    /**
     * Get latest app version info
     */
    @GET("api/v1/system/latest-version")
    suspend fun getLatestVersion(
        @Query("type") type: String
    ): Response<AppVersion>


    // ── AUTH ────────────────────────────────────────────────────


    /**
     * Courier login — returns JWT token and courier info
     */
    @POST("api/v1/auth/courier/login")
    suspend fun login(
        @Body request: LoginRequest
    ): Response<ApiResponse<LoginData>>

    /**
     * Get current courier profile
     */
    @GET("api/v1/courier/profile")
    suspend fun getCourierProfile(): Response<ApiResponse<CourierProfile>>

    // ── FCM ─────────────────────────────────────────────────────

    /**
     * Register FCM token with backend
     */
    @POST("api/v1/courier/fcm/register")
    suspend fun registerFCMToken(
        @Body request: FCMTokenRequest
    ): Response<ApiResponse<Boolean>>

    /**
     * Unregister FCM token from backend
     */
    @POST("api/v1/courier/fcm/unregister")
    suspend fun unregisterFCMToken(
        @Body request: FCMTokenRequest
    ): Response<ApiResponse<Boolean>>

    // ── ORDERS ──────────────────────────────────────────────────

    /**
     * Get all orders assigned to current courier
     */
    @GET("api/v1/courier/orders")
    suspend fun getOrders(): Response<ApiResponse<List<Order>>>

    /**
     * Update order status
     */
    @POST("api/v1/orders/status")
    suspend fun updateStatus(
        @Body request: StatusUpdateRequest
    ): Response<ApiResponse<Boolean>>

    /**
     * Scan package (pickup scan)
     */
    @POST("api/v1/orders/scan")
    suspend fun scanPackage(
        @Body request: ScanRequest
    ): Response<ApiResponse<ScanResponse>>

    /**
     * Upload Proof of Delivery image
     */
    @Multipart
    @POST("api/v1/orders/pod/upload")
    suspend fun uploadPod(
        @Part("order_id") orderId: RequestBody,
        @Part photo: MultipartBody.Part
    ): Response<ApiResponse<String>>

    // ── LOCATION ────────────────────────────────────────────────

    /**
     * Sync courier location batch to backend
     */
    @POST("api/v1/tracking/sync")
    suspend fun syncLocations(
        @Body request: LocationRequest
    ): Response<ApiResponse<LocationResponse>>

    // ── CHATS ───────────────────────────────────────────────────

    /**
     * Retrieves the message history of the current active job.
     */
    @GET("api/v1/mobile/chats/orders/{id}/chats")
    suspend fun getOrderChats(
        @Path("id") id: String
    ): Response<ChatResponse>

    /**
     * Dispatches a full-duplex real-time message via REST persistence gateway.
     */
    @POST("api/v1/mobile/chats/orders/{id}/chats")
    suspend fun sendOrderChat(
        @Path("id") id: String,
        @Body request: SendMessageRequest
    ): Response<SendMessageResponse>
}
