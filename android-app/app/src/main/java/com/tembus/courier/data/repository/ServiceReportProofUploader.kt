package com.tembus.courier.data.repository

import android.graphics.Bitmap
import com.tembus.courier.data.api.TEMBUSApiService
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import retrofit2.Response
import java.io.ByteArrayOutputStream
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ServiceReportProofUploader @Inject constructor(
    private val apiService: TEMBUSApiService
) {
    suspend fun upload(
        orderId: String,
        serviceType: String,
        proofType: String,
        bitmap: Bitmap
    ): Result<String> = withContext(Dispatchers.IO) {
        try {
            val jpegBytes = compressBitmap(bitmap)
            val textType = "text/plain".toMediaTypeOrNull()
            val photoBody = jpegBytes.toRequestBody("image/jpeg".toMediaTypeOrNull())
            val photoPart = MultipartBody.Part.createFormData(
                "photo",
                "service_report_${proofType}_${System.currentTimeMillis()}.jpg",
                photoBody
            )
            val response = apiService.uploadServiceReportProof(
                idempotencyKey = "service-report-proof-$orderId-$proofType-${UUID.randomUUID()}",
                orderId = orderId.toRequestBody(textType),
                serviceType = serviceType.toRequestBody(textType),
                proofType = proofType.toRequestBody(textType),
                photo = photoPart
            )
            if (!response.isSuccessful || response.body()?.success != true) {
                return@withContext Result.failure(
                    IllegalStateException(response.uploadErrorMessage("Bukti layanan belum berhasil diunggah."))
                )
            }
            val fileUrl = response.body()
                ?.data
                ?.jsonObject
                ?.get("file_url")
                ?.jsonPrimitive
                ?.content
                ?.takeIf { it.isNotBlank() }

            if (fileUrl.isNullOrBlank()) {
                Result.failure(IllegalStateException("Backend belum mengembalikan URL bukti layanan."))
            } else {
                Result.success(fileUrl)
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    private fun compressBitmap(bitmap: Bitmap, maxDim: Int = 1280, quality: Int = 85): ByteArray {
        val ratio = maxDim.toFloat() / maxOf(bitmap.width, bitmap.height)
        val outputBitmap = if (ratio < 1f) {
            Bitmap.createScaledBitmap(
                bitmap,
                (bitmap.width * ratio).toInt().coerceAtLeast(1),
                (bitmap.height * ratio).toInt().coerceAtLeast(1),
                true
            )
        } else {
            bitmap
        }
        return ByteArrayOutputStream().use { out ->
            outputBitmap.compress(Bitmap.CompressFormat.JPEG, quality, out)
            out.toByteArray()
        }
    }

    private fun Response<*>.uploadErrorMessage(fallback: String): String {
        val raw = runCatching { errorBody()?.string() }.getOrNull()
        return raw
            ?.takeIf { it.isNotBlank() }
            ?.take(240)
            ?: message().takeIf { it.isNotBlank() }
            ?: fallback
    }
}
