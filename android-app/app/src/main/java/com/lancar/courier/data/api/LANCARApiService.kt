package com.lancar.courier.data.api

import com.lancar.courier.data.model.AppVersion
import com.lancar.courier.data.model.ApiResponse

import com.lancar.courier.data.model.CourierProfile
import com.lancar.courier.data.model.CourierCapabilityProfile
import com.lancar.courier.data.model.CourierHotspot
import com.lancar.courier.data.model.CourierEarningsLedger
import com.lancar.courier.data.model.CourierPerformanceSummary
import com.lancar.courier.data.model.CourierPayoutCreateData
import com.lancar.courier.data.model.CourierPayoutCreateRequest
import com.lancar.courier.data.model.CourierPayoutRequestItem
import com.lancar.courier.data.model.CourierPayoutSummaryData
import com.lancar.courier.data.model.CourierRoutePreview
import com.lancar.courier.data.model.CourierSafetyEventData
import com.lancar.courier.data.model.CourierSafetyEventRequest
import com.lancar.courier.data.model.CourierServiceProduct
import com.lancar.courier.data.model.CourierTrainingCompleteRequest
import com.lancar.courier.data.model.CourierTrainingCompletion
import com.lancar.courier.data.model.CourierDocumentUploadData
import com.lancar.courier.data.model.CourierRegistrationData
import com.lancar.courier.data.model.CourierRegistrationRequest
import com.lancar.courier.data.model.DutyStatusRequest
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
import com.lancar.courier.data.model.TripShareData
import com.lancar.courier.data.model.TripShareRequest
import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.Response
import retrofit2.http.*
import kotlinx.serialization.json.JsonElement

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

    @POST("api/v1/auth/courier/register")
    suspend fun registerCourier(
        @Body request: CourierRegistrationRequest
    ): Response<ApiResponse<CourierRegistrationData>>

    @Multipart
    @POST("api/v1/auth/courier/documents/upload")
    suspend fun uploadCourierDocument(
        @Part("doc_type") docType: RequestBody,
        @Part file: MultipartBody.Part
    ): Response<ApiResponse<CourierDocumentUploadData>>

    /**
     * Get current courier profile
     */
    @GET("api/v1/courier/profile")
    suspend fun getCourierProfile(): Response<ApiResponse<CourierProfile>>

    @GET("api/v1/courier/on-demand/services")
    suspend fun getOnDemandServices(): Response<ApiResponse<List<CourierServiceProduct>>>

    @GET("api/v1/courier/on-demand/hotspots")
    suspend fun getOnDemandHotspots(): Response<ApiResponse<List<CourierHotspot>>>

    @GET("api/v1/courier/performance")
    suspend fun getCourierPerformance(): Response<ApiResponse<CourierPerformanceSummary>>

    @GET("api/v1/courier/earnings-ledger")
    suspend fun getCourierEarningsLedger(): Response<ApiResponse<CourierEarningsLedger>>

    @GET("api/v1/courier/payout/summary")
    suspend fun getCourierPayoutSummary(): Response<ApiResponse<CourierPayoutSummaryData>>

    @GET("api/v1/courier/payout/requests")
    suspend fun getCourierPayoutRequests(): Response<ApiResponse<List<CourierPayoutRequestItem>>>

    @POST("api/v1/courier/payout/requests")
    suspend fun createCourierPayoutRequest(
        @Header("X-Idempotency-Key") idempotencyKey: String,
        @Body request: CourierPayoutCreateRequest
    ): Response<ApiResponse<CourierPayoutCreateData>>

    @GET("api/v1/courier/capabilities")
    suspend fun getCourierCapabilities(): Response<ApiResponse<CourierCapabilityProfile>>

    @POST("api/v1/courier/training/complete")
    suspend fun completeCourierTraining(
        @Body request: CourierTrainingCompleteRequest
    ): Response<ApiResponse<CourierTrainingCompletion>>

    @POST("api/v1/courier/safety-events")
    suspend fun createSafetyEvent(
        @Body request: CourierSafetyEventRequest
    ): Response<ApiResponse<CourierSafetyEventData>>

    @POST("api/v1/courier/trip-share")
    suspend fun createTripShare(
        @Body request: TripShareRequest
    ): Response<ApiResponse<TripShareData>>

    @PATCH("api/v1/courier/duty")
    suspend fun updateDutyStatus(
        @Body request: DutyStatusRequest
    ): Response<ApiResponse<CourierProfile>>

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
     * Get on-demand job offers available to current courier.
     */
    @GET("api/v1/courier/offers")
    suspend fun getOnDemandOffers(): Response<ApiResponse<List<Order>>>

    @GET("api/v1/courier/orders/{orderId}/route")
    suspend fun getCourierRoutePreview(
        @Path("orderId") orderId: String
    ): Response<ApiResponse<CourierRoutePreview>>

    /**
     * Accept an on-demand job offer.
     */
    @POST("api/v1/courier/offers/{id}/accept")
    suspend fun acceptOnDemandOffer(
        @Path("id") orderId: String
    ): Response<ApiResponse<Order>>

    /**
     * Reject an on-demand job offer.
     */
    @POST("api/v1/courier/offers/{id}/reject")
    suspend fun rejectOnDemandOffer(
        @Path("id") orderId: String,
        @Body request: Map<String, String> = mapOf("reason" to "courier_rejected")
    ): Response<ApiResponse<Boolean>>

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
        @Part("latitude") latitude: RequestBody,
        @Part("longitude") longitude: RequestBody,
        @Part("accuracy") accuracy: RequestBody,
        @Part("proof_type") proofType: RequestBody,
        @Part("barcode_value") barcodeValue: RequestBody?,
        @Part("spoof_risk") spoofRisk: RequestBody?,
        @Part photo: MultipartBody.Part
    ): Response<ApiResponse<JsonElement>>

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
