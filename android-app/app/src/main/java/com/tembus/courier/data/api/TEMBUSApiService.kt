package com.tembus.courier.data.api

import com.tembus.courier.data.model.AppVersion
import com.tembus.courier.data.model.ApiResponse
import com.tembus.courier.data.model.RuntimeConfigResponse
import com.tembus.courier.data.model.SosTamperRequest
import com.tembus.courier.data.model.SosTriggerRequest
import com.tembus.courier.data.model.SosTriggerResponse
import com.tembus.courier.data.model.CourierProfile
import com.tembus.courier.data.model.CourierCapabilityProfile
import com.tembus.courier.data.model.CourierHotspot
import com.tembus.courier.data.model.CourierEarningsLedger
import com.tembus.courier.data.model.CourierPerformanceSummary
import com.tembus.courier.data.model.CourierPayoutCreateData
import com.tembus.courier.data.model.CourierPayoutCreateRequest
import com.tembus.courier.data.model.CourierPayoutRequestItem
import com.tembus.courier.data.model.CourierPayoutSummaryData
import com.tembus.courier.data.model.CourierActiveRoutePlan
import com.tembus.courier.data.model.CourierRoutePreview
import com.tembus.courier.data.model.CourierSafetyEventData
import com.tembus.courier.data.model.CourierSafetyEventRequest
import com.tembus.courier.data.model.CourierServiceProduct
import com.tembus.courier.data.model.CourierTrainingCompleteRequest
import com.tembus.courier.data.model.CourierTrainingCompletion
import com.tembus.courier.data.model.CourierDocumentUploadData
import com.tembus.courier.data.model.CourierFaceVerificationData
import com.tembus.courier.data.model.CourierOtpVerifyRequest
import com.tembus.courier.data.model.CourierRegistrationData
import com.tembus.courier.data.model.CourierRegistrationRequest
import com.tembus.courier.data.model.CancelPickupReason
import com.tembus.courier.data.model.DutyStatusRequest
import com.tembus.courier.data.model.FCMTokenRequest
import com.tembus.courier.data.model.LocationRequest
import com.tembus.courier.data.model.UpdateCapacityRequest
import com.tembus.courier.data.model.LocationResponse
import com.tembus.courier.data.model.LoginData
import com.tembus.courier.data.model.LoginRequest
import com.tembus.courier.data.model.MapsProviderConfig
import com.tembus.courier.data.model.Order
import com.tembus.courier.data.model.OrderStatusTransition
import com.tembus.courier.data.model.ScanRequest
import com.tembus.courier.data.model.ScanResponse
import com.tembus.courier.data.model.StatusUpdateRequest
import com.tembus.courier.data.model.ChatResponse
import com.tembus.courier.data.model.CallResponse
import com.tembus.courier.data.model.CreateCallRequest
import com.tembus.courier.data.model.EndCallRequest
import com.tembus.courier.data.model.JoinCallRequest
import com.tembus.courier.data.model.ReadReceiptRequest
import com.tembus.courier.data.model.ReadReceiptResponse
import com.tembus.courier.data.model.SendMessageRequest
import com.tembus.courier.data.model.SendMessageResponse
import com.tembus.courier.data.model.TripShareData
import com.tembus.courier.data.model.TripShareRequest
import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.Response
import retrofit2.http.*
import com.tembus.courier.data.model.AppNotification
import com.tembus.courier.data.model.UnreadCountData
import kotlinx.serialization.json.JsonElement

/**
 * TEMBUS API Service Interface
 *
 * Retrofit interface for backend API calls.
 * Handles auth, FCM token registration, order operations, and location sync.
 */
interface TEMBUSApiService {
    
    // ── SYSTEM ──────────────────────────────────────────────────
    
    /**
     * Get latest app version info
     */
    @GET("api/v1/system/latest-version")
    suspend fun getLatestVersion(
        @Query("type") type: String
    ): Response<AppVersion>

    @GET("api/v1/maps/config")
    suspend fun getMapsProviderConfig(
        @Query("scope") scope: String = "courier_mobile"
    ): Response<MapsProviderConfig>

    @GET("api/v1/config/runtime")
    suspend fun getRuntimeConfig(): Response<RuntimeConfigResponse>


    // ── AUTH ────────────────────────────────────────────────────


    /**
     * Courier login — returns JWT token and courier info
     */
    @POST("api/v1/auth/courier/login")
    suspend fun login(
        @Body request: LoginRequest
    ): Response<ApiResponse<LoginData>>

    @POST("api/v1/auth/courier/otp/verify")
    suspend fun verifyCourierLoginOtp(
        @Body request: CourierOtpVerifyRequest
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

    @POST("api/v1/couriers/local-security-log")
    suspend fun logLocalSecurity(
        @Body request: com.tembus.courier.data.model.SecurityLogRequest
    ): Response<ApiResponse<Any>>

    @POST("api/v1/auth/password-reset/request")
    suspend fun requestPasswordReset(
        @Body request: com.tembus.courier.data.model.ForgotPasswordRequest
    ): Response<ApiResponse<Boolean>>

    @POST("api/v1/auth/password-reset/confirm")
    suspend fun confirmPasswordReset(
        @Body request: com.tembus.courier.data.model.ConfirmPasswordResetRequest
    ): Response<ApiResponse<Boolean>>

    /**
     * Get current courier profile
     */
    @GET("api/v1/courier/profile")
    suspend fun getCourierProfile(): Response<ApiResponse<CourierProfile>>

    @PUT("api/v1/courier/profile/capacity")
    suspend fun updateCapacity(
        @Body request: UpdateCapacityRequest
    ): Response<ApiResponse<CourierProfile>>

    @GET("api/v1/courier/on-demand/services")
    suspend fun getOnDemandServices(): Response<ApiResponse<List<CourierServiceProduct>>>

    @GET("api/v1/courier/on-demand/hotspots")
    suspend fun getOnDemandHotspots(): Response<ApiResponse<List<CourierHotspot>>>

    @GET("api/v1/courier/on-demand/pickup-cancellation-reasons")
    suspend fun getPickupCancellationReasons(): Response<ApiResponse<List<CancelPickupReason>>>

    @GET("api/v1/courier/order-status-transitions")
    suspend fun getOrderStatusTransitions(
        @Query("workflow_role") workflowRole: String
    ): Response<ApiResponse<List<OrderStatusTransition>>>

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

    @Multipart
    @POST("api/v1/courier/safety-events/photo")
    suspend fun createSafetyEventWithPhoto(
        @Part("order_id") orderId: RequestBody?,
        @Part("event_type") eventType: RequestBody,
        @Part("severity") severity: RequestBody,
        @Part("latitude") latitude: RequestBody?,
        @Part("longitude") longitude: RequestBody?,
        @Part("accuracy") accuracy: RequestBody?,
        @Part("message") message: RequestBody?,
        @Part photo: MultipartBody.Part
    ): Response<ApiResponse<CourierSafetyEventData>>


    @POST("api/v1/couriers/sos/tamper")
    suspend fun reportSosTamper(
        @Body request: SosTamperRequest
    ): Response<ApiResponse<Any>>

    @POST("api/v1/couriers/sos/trigger")
    suspend fun triggerSos(
        @Body request: SosTriggerRequest
    ): Response<ApiResponse<SosTriggerResponse>>

    @POST("api/v1/courier/trip-share")
    suspend fun createTripShare(
        @Body request: TripShareRequest
    ): Response<ApiResponse<TripShareData>>

    @Multipart
    @POST("api/v1/couriers/verify-liveness")
    suspend fun verifyCourierFace(
        @Header("X-Idempotency-Key") idempotencyKey: String,
        @Part("order_id") orderId: RequestBody?,
        @Part("verification_type") verificationType: RequestBody,
        @Part("liveness_score") livenessScore: RequestBody?,
        @Part photo: MultipartBody.Part
    ): Response<ApiResponse<CourierFaceVerificationData>>

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

    @GET("api/v1/courier/routes/active-plan")
    suspend fun getCourierActiveRoutePlan(): Response<ApiResponse<CourierActiveRoutePlan>>

    @Multipart
    @POST("api/v1/courier/orders/{orderId}/cancel-pickup")
    suspend fun cancelOnDemandPickup(
        @Path("orderId") orderId: String,
        @Part("reason_code") reasonCode: RequestBody,
        @Part("reason_note") reasonNote: RequestBody?,
        @Part("latitude") latitude: RequestBody?,
        @Part("longitude") longitude: RequestBody?,
        @Part("accuracy") accuracy: RequestBody?,
        @Part photo: MultipartBody.Part
    ): Response<ApiResponse<JsonElement>>

    /**
     * Accept an on-demand job offer.
     */
    @POST("api/v1/courier/offers/{id}/accept")
    suspend fun acceptOnDemandOffer(
        @Path("id") orderId: String,
        @Header("X-Idempotency-Key") idempotencyKey: String
    ): Response<ApiResponse<Order>>

    /**
     * Reject an on-demand job offer.
     */
    @POST("api/v1/courier/offers/{id}/reject")
    suspend fun rejectOnDemandOffer(
        @Path("id") orderId: String,
        @Header("X-Idempotency-Key") idempotencyKey: String,
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
        @Header("X-Idempotency-Key") idempotencyKey: String,
        @Body request: ScanRequest
    ): Response<ApiResponse<ScanResponse>>

    /**
     * Upload Proof of Delivery image
     */
    @Multipart
    @POST("api/v1/orders/pod/upload")
    suspend fun uploadPod(
        @Header("X-Idempotency-Key") idempotencyKey: String,
        @Part("order_id") orderId: RequestBody,
        @Part("latitude") latitude: RequestBody,
        @Part("longitude") longitude: RequestBody,
        @Part("accuracy") accuracy: RequestBody,
        @Part("proof_type") proofType: RequestBody,
        @Part("barcode_value") barcodeValue: RequestBody?,
        @Part("package_code") packageCode: RequestBody?,
        @Part("face_verification_id") faceVerificationId: RequestBody?,
        @Part("override_reason") overrideReason: RequestBody?,
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

    // ── NOTIFICATIONS ───────────────────────────────────────────

    @GET("api/v1/mobile/notifications")
    suspend fun getNotifications(
        @Query("limit") limit: Int = 50
    ): Response<ApiResponse<List<AppNotification>>>

    @GET("api/v1/mobile/notifications/unread-count")
    suspend fun getUnreadNotificationCount(): Response<ApiResponse<UnreadCountData>>

    @PATCH("api/v1/mobile/notifications/read-all")
    suspend fun markAllNotificationsRead(): Response<ApiResponse<JsonElement>>

    @PATCH("api/v1/mobile/notifications/{id}/read")
    suspend fun markNotificationRead(
        @Path("id") id: String
    ): Response<ApiResponse<AppNotification>>

    // PERFORMANCE & TIERING
    @GET("api/v1/couriers/me/performance")
    suspend fun getMyPerformanceStats(): Response<ApiResponse<com.tembus.courier.data.model.CourierPerformanceStats>>

    // ============================================================
    // TAMBAL BAN & TOWING — Service Endpoints
    // ============================================================
    
    @PUT("api/v1/courier/availability-state")
    suspend fun updateAvailabilityState(@Body request: Map<String, Any>): Response<Map<String, String>>
    
    @GET("api/v1/courier/availability-state")
    suspend fun getAvailabilityState(): Response<Map<String, Any>>
    
    @POST("api/v1/courier/service-report/tambal-ban")
    suspend fun createTambalBanReport(@Body request: Map<String, Any>): Response<Map<String, Any>>
    
    @POST("api/v1/courier/service-report/towing")
    suspend fun createTowingReport(@Body request: Map<String, Any>): Response<Map<String, Any>>
    
    @PUT("api/v1/courier/service-price")
    suspend fun updateServicePrice(@Body request: Map<String, Any>): Response<Map<String, String>>
    
    @GET("api/v1/courier/service-price/{serviceCode}")
    suspend fun getServicePrice(@Path("serviceCode") serviceCode: String): Response<Map<String, Any>>
}

