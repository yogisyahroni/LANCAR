package com.lancar.courier.data.api

import com.lancar.courier.data.model.ApiResponse
import com.lancar.courier.data.model.FCMTokenRequest
import com.lancar.courier.data.model.LocationRequest
import com.lancar.courier.data.model.LocationResponse
import com.lancar.courier.data.model.Order
import com.lancar.courier.data.model.ScanRequest
import com.lancar.courier.data.model.ScanResponse
import com.lancar.courier.data.model.StatusUpdateRequest
import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.Response
import retrofit2.http.*

/**
 * LANCAR API Service Interface
 * 
 * Retrofit interface for backend API calls.
 * Handles FCM token registration and order sync operations.
 */
interface LANCARApiService {

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

    /**
     * Get assigned orders for current courier
     */
    @GET("api/v1/orders")
    suspend fun getOrders(): Response<ApiResponse<List<Order>>>

    /**
     * Update order status
     */
    @POST("api/v1/orders/status")
    suspend fun updateStatus(
        @Body request: StatusUpdateRequest
    ): Response<ApiResponse<Boolean>>

    /**
     * Scan package
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

    /**
     * Sync courier location data
     */
    @POST("api/v1/courier/location/sync")
    suspend fun syncLocations(
        @Body request: LocationRequest
    ): Response<ApiResponse<LocationResponse>>
}
