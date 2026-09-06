package com.tembus.customer.data.repository

import com.tembus.customer.data.api.ServiceAdjustmentApi
import com.tembus.customer.data.model.ServiceAdjustment
import com.tembus.customer.data.model.ServiceAdjustmentDecisionRequest
import retrofit2.Retrofit
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ServiceAdjustmentRepository @Inject constructor(
    retrofit: Retrofit
) {
    private val api = retrofit.create(ServiceAdjustmentApi::class.java)

    suspend fun listForOrder(orderId: String): Result<List<ServiceAdjustment>> = runCatching {
        val normalizedOrderId = orderId.trim()
        require(normalizedOrderId.isNotEmpty()) { "Order ID wajib tersedia" }
        val response = api.listForOrder(normalizedOrderId)
        val body = response.body()
        if (!response.isSuccessful || body == null) {
            throw IllegalStateException("Penyesuaian harga belum dapat dimuat (${response.code()})")
        }
        body.adjustments
    }

    suspend fun decide(
        adjustmentId: String,
        approve: Boolean,
        rejectionReason: String? = null
    ): Result<ServiceAdjustment> = runCatching {
        val normalizedId = adjustmentId.trim()
        require(normalizedId.isNotEmpty()) { "Adjustment ID wajib tersedia" }
        val decision = if (approve) "approve" else "reject"
        val reason = if (approve) null else rejectionReason?.trim().orEmpty().ifBlank {
            "Customer tidak menyetujui penyesuaian harga"
        }
        val idempotencyKey = "customer-adjustment-decision-$normalizedId-$decision"
        val response = api.decide(
            idempotencyKey = idempotencyKey,
            request = ServiceAdjustmentDecisionRequest(
                adjustmentId = normalizedId,
                decision = decision,
                rejectionReason = reason
            )
        )
        response.body()?.takeIf { response.isSuccessful }
            ?: throw IllegalStateException("Keputusan penyesuaian belum tersimpan (${response.code()})")
    }
}
