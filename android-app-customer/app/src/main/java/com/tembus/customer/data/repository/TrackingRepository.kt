package com.tembus.customer.data.repository

import com.tembus.customer.data.api.TEMBUSApiService
import com.tembus.customer.data.model.ApiResponse
import com.tembus.customer.data.model.MapsProviderConfig
import com.tembus.customer.data.model.SafetyActionResponse
import com.tembus.customer.data.model.SafetyCenterData
import com.tembus.customer.data.model.SafetyIncident
import com.tembus.customer.data.model.SafetyIncidentRequest
import com.tembus.customer.data.model.TrackingResponse
import retrofit2.Response
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class TrackingRepository @Inject constructor(
    private val apiService: TEMBUSApiService
) {

    /**
     * Fetches the latest position and ETA for the active delivery.
     */
    suspend fun getTrackingData(orderId: String): Result<TrackingResponse> {
        return try {
            val response = apiService.getTracking(orderId)
            handleResponse(response)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getMapsProviderConfig(): Result<MapsProviderConfig> {
        return try {
            val response = apiService.getMapsProviderConfig("customer_mobile")
            val body = response.body()
            if (response.isSuccessful && body != null) {
                Result.success(body)
            } else {
                Result.failure(Exception("Gagal memuat konfigurasi peta (${response.code()})"))
            }
        } catch (exception: Exception) {
            Result.failure(exception)
        }
    }

    suspend fun getSafetyCenter(orderId: String): Result<SafetyCenterData> = runCatching {
        val response = apiService.getCustomerSafetyCenter(orderId)
        val body = response.body()
        if (!response.isSuccessful || body?.success != true || body.data == null) {
            throw Exception(body?.message ?: "Safety Center belum tersedia (${response.code()})")
        }
        body.data
    }

    suspend fun reportSafety(orderId: String, message: String, idempotencyKey: String): Result<SafetyIncident> = runCatching {
        val response = apiService.reportCustomerSafetyIncident(
            orderId,
            idempotencyKey,
            SafetyIncidentRequest("CUSTOMER_SAFETY_REPORT", "HIGH", message.take(500))
        )
        val body = response.body()
        if (!response.isSuccessful || body?.success != true || body.data == null) {
            throw Exception(body?.message ?: "Laporan keselamatan gagal (${response.code()})")
        }
        body.data
    }

    suspend fun triggerSafetySos(orderId: String, idempotencyKey: String): Result<SafetyActionResponse> = runCatching {
        val response = apiService.triggerCustomerSafetySos(orderId, idempotencyKey)
        val body = response.body()
        if (!response.isSuccessful || body?.success != true) {
            throw Exception(body?.message ?: "SOS gagal dikirim (${response.code()})")
        }
        body
    }

    private fun handleResponse(response: Response<ApiResponse<TrackingResponse>>): Result<TrackingResponse> {
        return if (response.isSuccessful) {
            val apiResponse = response.body()
            val trackingData = apiResponse?.data
            if (trackingData != null) {
                Result.success(trackingData)
            } else {
                Result.failure(Exception(apiResponse?.message ?: "Gagal memuat data pelacakan"))
            }
        } else {
            Result.failure(Exception("Koneksi bermasalah (${response.code()})"))
        }
    }
}
