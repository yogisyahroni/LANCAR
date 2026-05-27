package com.tembus.customer.data.repository

import com.tembus.customer.data.api.TEMBUSApiService
import com.tembus.customer.data.model.MapsProviderConfig
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class MapsProviderRepository @Inject constructor(
    private val apiService: TEMBUSApiService
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
