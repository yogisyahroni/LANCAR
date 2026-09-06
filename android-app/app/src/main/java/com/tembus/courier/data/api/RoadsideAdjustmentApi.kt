package com.tembus.courier.data.api

import com.tembus.courier.data.model.RoadsideAdjustmentProposalRequest
import com.tembus.courier.data.model.RoadsideAdjustmentResponse
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.Header
import retrofit2.http.POST

interface RoadsideAdjustmentApi {
    @POST("api/v1/courier/service-adjustments")
    suspend fun propose(
        @Header("X-Idempotency-Key") idempotencyKey: String,
        @Body request: RoadsideAdjustmentProposalRequest
    ): Response<RoadsideAdjustmentResponse>
}
