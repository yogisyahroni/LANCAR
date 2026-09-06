package com.tembus.customer.data.api

import com.tembus.customer.data.model.RoadsideClaimRequest
import com.tembus.customer.data.model.RoadsideClaimResponse
import com.tembus.customer.data.model.RoadsideRatingRequest
import com.tembus.customer.data.model.RoadsideRatingResponse
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.Header
import retrofit2.http.POST

interface RoadsideAftercareApi {
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
