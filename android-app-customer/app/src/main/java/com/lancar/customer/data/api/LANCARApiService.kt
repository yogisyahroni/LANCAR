package com.lancar.customer.data.api

import com.lancar.customer.data.model.AuthResponse
import com.lancar.customer.data.model.LoginRequest
import com.lancar.customer.data.model.OtpRequest
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Query

interface LANCARApiService {

    @POST("auth/customer/otp-request")
    suspend fun requestOtp(@Body request: OtpRequest): Response<AuthResponse>

    @POST("auth/customer/login")
    suspend fun login(@Body request: LoginRequest): Response<AuthResponse>
    
    // Nanti akan ditambahkan endpoint untuk Order / Profil

    @GET("api/v1/tracking")
    suspend fun getTracking(
        @Query("order_id") orderId: String
    ): Response<com.lancar.customer.data.model.ApiResponse<com.lancar.customer.data.model.TrackingResponse>>
}
