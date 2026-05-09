package com.lancar.courier.data.api

import com.lancar.courier.data.model.ApiResponse
import com.lancar.courier.data.model.FCMTokenRequest
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.Header
import retrofit2.http.POST

/**
 * LANCAR API Service Interface
 * 
 * Retrofit interface for backend API calls.
 * Handles FCM token registration and order sync operations.
 */
interface LANCARApiService {

    /**
     * Register FCM token with backend
     * Called when app starts or FCM token is refreshed
     */
    @POST("api/v1/courier/fcm/register")
    suspend fun registerFCMToken(
        @Header("Authorization") authToken: String,
        @Body request: FCMTokenRequest
    ): Response<ApiResponse<Boolean>>

    /**
     * Unregister FCM token from backend
     * Called when user logs out
     */
    @POST("api/v1/courier/fcm/unregister")
    suspend fun unregisterFCMToken(
        @Header("Authorization") authToken: String,
        @Body request: FCMTokenRequest
    ): Response<ApiResponse<Boolean>>
}
