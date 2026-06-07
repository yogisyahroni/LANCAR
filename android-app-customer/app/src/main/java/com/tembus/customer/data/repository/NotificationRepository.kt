package com.tembus.customer.data.repository

import com.tembus.customer.data.api.TEMBUSApiService
import com.tembus.customer.data.model.NotificationData
import com.tembus.customer.data.model.NotificationUnreadCount
import com.tembus.customer.data.model.RegisterTokenRequest
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class NotificationRepository @Inject constructor(
    private val apiService: TEMBUSApiService
) {
    suspend fun getNotifications(category: String? = null): Result<List<NotificationData>> {
        return try {
            val response = apiService.getNotifications(category = category)
            if (response.isSuccessful) {
                val body = response.body()
                Result.success(body?.data?.takeIf { it.isNotEmpty() } ?: body?.notifications.orEmpty())
            } else {
                Result.failure(Exception("Failed to load notifications: ${response.code()}"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getUnreadCount(): Result<NotificationUnreadCount> {
        return try {
            val response = apiService.getNotificationUnreadCount()
            if (response.isSuccessful) {
                Result.success(response.body()?.data ?: NotificationUnreadCount())
            } else {
                Result.failure(Exception("Failed to load notification count: ${response.code()}"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun markRead(id: String): Result<Unit> {
        return try {
            val response = apiService.markNotificationRead(id)
            if (response.isSuccessful) Result.success(Unit) else Result.failure(Exception("Failed to mark notification read: ${response.code()}"))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun markAllRead(category: String? = null): Result<Unit> {
        return try {
            val response = apiService.markAllNotificationsRead(
                if (category.isNullOrBlank()) emptyMap() else mapOf("category" to category)
            )
            if (response.isSuccessful) Result.success(Unit) else Result.failure(Exception("Failed to mark notifications read: ${response.code()}"))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun archive(id: String): Result<Unit> {
        return try {
            val response = apiService.archiveNotification(id)
            if (response.isSuccessful) Result.success(Unit) else Result.failure(Exception("Failed to archive notification: ${response.code()}"))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

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
