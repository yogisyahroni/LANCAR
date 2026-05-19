package com.lancar.customer.data.repository

import com.lancar.customer.data.api.LANCARApiService
import com.lancar.customer.data.model.ApiResponse
import com.lancar.customer.data.model.MapsProviderConfig
import com.lancar.customer.data.model.TrackingResponse
import retrofit2.Response
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class TrackingRepository @Inject constructor(
    private val apiService: LANCARApiService
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
