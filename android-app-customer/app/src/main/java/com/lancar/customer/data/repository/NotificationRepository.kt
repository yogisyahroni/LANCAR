package com.lancar.customer.data.repository

import com.lancar.customer.data.api.TEMBUSApiService
import com.lancar.customer.data.model.RegisterTokenRequest
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class NotificationRepository @Inject constructor(
    private val apiService: TEMBUSApiService
) {
    suspend fun registerDeviceToken(token: String): Result<Unit> {
        return try {
            val response = apiService.registerDeviceToken(RegisterTokenRequest(device_token = token))
            if (response.isSuccessful) {
                Result.success(Unit)
            } else {
                Result.failure(Exception("Failed to register token: ${response.code()}"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
