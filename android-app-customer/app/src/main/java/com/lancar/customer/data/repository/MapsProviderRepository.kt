package com.lancar.customer.data.repository

import com.lancar.customer.data.api.LANCARApiService
import com.lancar.customer.data.model.MapsProviderConfig
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class MapsProviderRepository @Inject constructor(
    private val apiService: LANCARApiService
) {
    suspend fun getRuntimeConfig(scope: String = "customer_mobile"): Result<MapsProviderConfig> {
        return try {
            val response = apiService.getMapsProviderConfig(scope)
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
}
