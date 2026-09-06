package com.tembus.courier.data.api

import com.tembus.courier.data.model.ServiceAdjustment
import com.tembus.courier.data.model.ServiceAdjustmentProposalRequest
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.Header
import retrofit2.http.POST

interface ServiceAdjustmentApi {
    @POST("api/v1/courier/service-adjustments")
    suspend fun propose(
        @Header("X-Idempotency-Key") idempotencyKey: String,
        @Body request: ServiceAdjustmentProposalRequest
    ): Response<ServiceAdjustment>
}
