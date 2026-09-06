package com.tembus.courier.data.repository

import com.tembus.courier.data.api.RoadsideAdjustmentApi
import com.tembus.courier.data.model.RoadsideAdjustmentItemRequest
import com.tembus.courier.data.model.RoadsideAdjustmentProposalRequest
import com.tembus.courier.data.model.RoadsideAdjustmentResponse
import retrofit2.Retrofit
import java.security.MessageDigest
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class RoadsideAdjustmentRepository @Inject constructor(
    retrofit: Retrofit
) {
    private val api = retrofit.create(RoadsideAdjustmentApi::class.java)

    suspend fun propose(
        orderId: String,
        reason: String,
        items: List<RoadsideAdjustmentItemRequest>
    ): Result<RoadsideAdjustmentResponse> = runCatching {
        val normalizedOrderId = orderId.trim()
        val normalizedReason = reason.trim()
        require(normalizedOrderId.isNotEmpty()) { "Order ID wajib tersedia" }
        require(normalizedReason.length in 5..500) { "Alasan penyesuaian harus 5-500 karakter" }
        require(items.isNotEmpty()) { "Minimal satu item penyesuaian wajib diisi" }

        val request = RoadsideAdjustmentProposalRequest(
            orderId = normalizedOrderId,
            reason = normalizedReason,
            items = items
        )
        val idempotencyKey = deterministicKey(request)
        val response = api.propose(idempotencyKey, request)
        response.body()?.takeIf { response.isSuccessful }
            ?: throw IllegalStateException("Penyesuaian harga belum terkirim (${response.code()})")
    }

    private fun deterministicKey(request: RoadsideAdjustmentProposalRequest): String {
        val canonical = buildString {
            append(request.orderId)
            append('|')
            append(request.reason)
            request.items.forEach { item ->
                append('|')
                append(item.code)
                append(':')
                append(item.label)
                append(':')
                append(item.type)
                append(':')
                append(item.quantity)
                append(':')
                append(item.unitPriceIdr)
            }
        }
        val digest = MessageDigest.getInstance("SHA-256").digest(canonical.toByteArray())
        val shortHash = digest.joinToString("") { "%02x".format(it) }.take(24)
        return "courier-adjustment-${request.orderId.take(12)}-$shortHash"
    }
}
