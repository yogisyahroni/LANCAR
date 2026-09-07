package com.tembus.customer.data.repository

import com.tembus.customer.data.api.RoadsideAftercareApi
import com.tembus.customer.data.model.*
import retrofit2.Response
import retrofit2.Retrofit
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class RoadsideAftercareRepository @Inject constructor(retrofit: Retrofit) {
    private val api = retrofit.create(RoadsideAftercareApi::class.java)

    private fun <T> Response<T>.requireBody(action: String): T =
        body()?.takeIf { isSuccessful }
            ?: throw IllegalStateException("$action belum berhasil (${code()}). Silakan periksa status sebelum mencoba lagi.")

    suspend fun finalReport(orderId: String): Result<RoadsideFinalReportResponse> = runCatching {
        require(orderId.isNotBlank()) { "Order ID wajib tersedia" }
        api.finalReport(orderId.trim()).requireBody("Memuat laporan akhir")
    }

    suspend fun collect(adjustmentId: String): Result<RoadsidePaymentIntent> = runCatching {
        require(adjustmentId.isNotBlank()) { "Adjustment ID wajib tersedia" }
        api.collectAdjustment(
            "roadside-collection-${adjustmentId.trim()}",
            RoadsideCollectionRequest(adjustmentId.trim())
        ).requireBody("Membuat pembayaran tambahan")
    }

    // The same normalized payload keeps the same key across a network retry or
    // process recreation. A different claim/score is a different user intent.
    internal fun intentKey(kind: String, payload: String): String =
        UUID.nameUUIDFromBytes("roadside:$kind:$payload".toByteArray(Charsets.UTF_8)).toString()

    suspend fun claim(request: RoadsideClaimRequest): Result<RoadsideClaimResponse> = runCatching {
        val normalized = request.copy(description = request.description.trim())
        require(normalized.orderId.isNotBlank() && normalized.description.length in 10..2000)
        api.submitClaim(
            intentKey("claim", "${normalized.orderId}:${normalized.issueType}:${normalized.description}"),
            normalized
        ).requireBody("Mengirim klaim")
    }

    suspend fun rating(request: RoadsideRatingRequest): Result<RoadsideRatingResponse> = runCatching {
        require(request.orderId.isNotBlank() && request.overallRating in 1..5 && request.technicianQualityRating in 1..5)
        val normalized = request.copy(comment = request.comment?.trim())
        api.submitRating(
            intentKey("rating", "${normalized.orderId}:${normalized.overallRating}:${normalized.technicianQualityRating}:${normalized.comment.orEmpty()}"),
            normalized
        ).requireBody("Mengirim penilaian")
    }
}
