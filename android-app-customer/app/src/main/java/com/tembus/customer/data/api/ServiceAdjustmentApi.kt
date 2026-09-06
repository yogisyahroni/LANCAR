package com.tembus.customer.data.api

import com.tembus.customer.data.model.ServiceAdjustment
import com.tembus.customer.data.model.ServiceAdjustmentDecisionRequest
import com.tembus.customer.data.model.ServiceAdjustmentListResponse
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST
import retrofit2.http.Query

interface ServiceAdjustmentApi {
    @GET("api/v1/customer/service-adjustments")
    suspend fun listForOrder(
        @Query("order_id") orderId: String
    ): Response<ServiceAdjustmentListResponse>

    @POST("api/v1/customer/service-adjustments/decision")
    suspend fun decide(
        @Header("X-Idempotency-Key") idempotencyKey: String,
        @Body request: ServiceAdjustmentDecisionRequest
    ): Response<ServiceAdjustment>
}
