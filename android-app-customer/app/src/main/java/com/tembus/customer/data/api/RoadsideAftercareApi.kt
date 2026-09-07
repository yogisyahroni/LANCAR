package com.tembus.customer.data.api

import com.tembus.customer.data.model.RoadsideClaimRequest
import com.tembus.customer.data.model.RoadsideClaimResponse
import com.tembus.customer.data.model.RoadsideRatingRequest
import com.tembus.customer.data.model.RoadsideRatingResponse
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.Header
import retrofit2.http.POST
import retrofit2.http.GET
import retrofit2.http.Query
import com.tembus.customer.data.model.RoadsideFinalReportResponse
import com.tembus.customer.data.model.RoadsidePaymentIntent
import com.tembus.customer.data.model.RoadsideCollectionRequest

interface RoadsideAftercareApi {
    @GET("api/v1/customer/roadside/final-report")
    suspend fun finalReport(@Query("order_id") orderId: String): Response<RoadsideFinalReportResponse>

    @POST("api/v1/customer/roadside/adjustments/collect")
    suspend fun collectAdjustment(
        @Header("X-Idempotency-Key") idempotencyKey: String,
        @Body request: RoadsideCollectionRequest
    ): Response<RoadsidePaymentIntent>

    @POST("api/v1/customer/roadside/claims")
    suspend fun submitClaim(
        @Header("X-Idempotency-Key") idempotencyKey: String,
        @Body request: RoadsideClaimRequest
    ): Response<RoadsideClaimResponse>

    @POST("api/v1/customer/roadside/ratings")
    suspend fun submitRating(
        @Header("X-Idempotency-Key") idempotencyKey: String,
        @Body request: RoadsideRatingRequest
    ): Response<RoadsideRatingResponse>
}
