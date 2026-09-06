package com.tembus.courier.data.repository

import com.tembus.courier.data.api.ServiceAdjustmentApi
import com.tembus.courier.data.model.ServiceAdjustment
import com.tembus.courier.data.model.ServiceAdjustmentItem
import com.tembus.courier.data.model.ServiceAdjustmentProposalRequest
import retrofit2.Retrofit
import java.security.MessageDigest
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ServiceAdjustmentRepository @Inject constructor(
    retrofit: Retrofit
) {
    private val api = retrofit.create(ServiceAdjustmentApi::class.java)

    suspend fun propose(
        orderId: String,
        reason: String,
        items: List<ServiceAdjustmentItem>
    ): Result<ServiceAdjustment> = runCatching {
        val normalizedOrderId = orderId.trim()
        val normalizedReason = reason.trim()
        require(normalizedOrderId.isNotEmpty()) { "Order ID wajib tersedia" }
        require(normalizedReason.length in 5..500) { "Alasan penyesuaian harus 5-500 karakter" }
        require(items.isNotEmpty()) { "Minimal satu item penyesuaian wajib diisi" }

        val request = ServiceAdjustmentProposalRequest(
            orderId = normalizedOrderId,
            reason = normalizedReason,
            items = items
        )
        val response = api.propose(deterministicKey(request), request)
        response.body()?.takeIf { response.isSuccessful }
            ?: throw IllegalStateException("Penyesuaian harga belum terkirim (${response.code()})")
    }

    private fun deterministicKey(request: ServiceAdjustmentProposalRequest): String {
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
        val shortHash = digest.joinToString("") { byte -> "%02x".format(byte) }.take(24)
        return "courier-adjustment-${request.orderId.take(12)}-$shortHash"
    }
}
