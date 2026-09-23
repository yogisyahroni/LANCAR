package com.tembus.courier.data.repository

import android.graphics.Bitmap
import com.tembus.courier.data.api.TEMBUSApiService
import com.tembus.courier.data.model.CourierServicePrice
import com.tembus.courier.data.model.CourierServicePriceUpdateRequest
import com.tembus.courier.data.model.RoadsideVehicleVerification
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import retrofit2.Response
import java.io.ByteArrayOutputStream
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class RoadsideRepository @Inject constructor(
    private val api: TEMBUSApiService
) {
    suspend fun submitVehicleVerification(
        orderId: String,
        serviceType: String,
        matched: Boolean,
        observedType: String,
        observedMake: String,
        observedModel: String,
        observedPlate: String,
        notes: String,
        photo: Bitmap
    ): Result<RoadsideVehicleVerification> = withContext(Dispatchers.IO) {
        try {
            val bytes = compressBitmap(photo)
            val text = "text/plain".toMediaTypeOrNull()
            val image = MultipartBody.Part.createFormData(
                "photo",
                "roadside_vehicle_${serviceType}_${System.currentTimeMillis()}.jpg",
                bytes.toRequestBody("image/jpeg".toMediaTypeOrNull())
            )
            val response = api.submitRoadsideVehicleVerification(
                idempotencyKey = "roadside-vehicle-$orderId-${UUID.randomUUID()}",
                orderId = orderId.toRequestBody(text),
                serviceType = serviceType.toRequestBody(text),
                matchStatus = (if (matched) "matched" else "mismatch").toRequestBody(text),
                observedType = observedType.toRequestBody(text),
                observedMake = observedMake.toRequestBody(text),
                observedModel = observedModel.toRequestBody(text),
                observedPlate = observedPlate.trim().takeIf { it.isNotEmpty() }?.toRequestBody(text),
                notes = notes.trim().takeIf { it.isNotEmpty() }?.toRequestBody(text),
                photo = image
            )
            val data = response.body()?.data?.verification
            if (!response.isSuccessful || response.body()?.success != true || data == null) {
                Result.failure(IllegalStateException(response.errorMessage("Verifikasi kendaraan belum berhasil disimpan.")))
            } else {
                Result.success(data)
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getServicePrices(): Result<List<CourierServicePrice>> = withContext(Dispatchers.IO) {
        try {
            val response = api.getCourierServicePrices()
            val data = response.body()?.data
            if (!response.isSuccessful || response.body()?.success != true || data == null) {
                Result.failure(IllegalStateException(response.errorMessage("Harga layanan belum berhasil dimuat.")))
            } else Result.success(data)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun updateServicePrice(request: CourierServicePriceUpdateRequest): Result<CourierServicePrice> = withContext(Dispatchers.IO) {
        try {
            val response = api.updateServicePrice(request)
            val data = response.body()?.data
            if (!response.isSuccessful || response.body()?.success != true || data == null) {
                Result.failure(IllegalStateException(response.errorMessage("Harga jasa belum berhasil disimpan.")))
            } else Result.success(data)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    private fun compressBitmap(bitmap: Bitmap): ByteArray {
        val ratio = 1280f / maxOf(bitmap.width, bitmap.height)
        val output = if (ratio < 1f) {
            Bitmap.createScaledBitmap(
                bitmap,
                (bitmap.width * ratio).toInt().coerceAtLeast(1),
                (bitmap.height * ratio).toInt().coerceAtLeast(1),
                true
            )
        } else bitmap
        return ByteArrayOutputStream().use { stream ->
            output.compress(Bitmap.CompressFormat.JPEG, 85, stream)
            stream.toByteArray()
        }
    }

    private fun Response<*>.errorMessage(fallback: String): String {
        return runCatching { errorBody()?.string() }
            .getOrNull()
            ?.takeIf { it.isNotBlank() }
            ?.take(240)
            ?: message().takeIf { it.isNotBlank() }
            ?: fallback
    }
}
