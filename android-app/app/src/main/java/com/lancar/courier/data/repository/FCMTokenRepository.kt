package com.lancar.courier.data.repository

import android.content.Context
import android.provider.Settings
import android.util.Log
import com.google.firebase.messaging.FirebaseMessaging
import com.lancar.courier.data.api.ApiClient
import com.lancar.courier.data.model.FCMTokenRequest
import com.lancar.courier.data.session.AuthSessionManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext

/**
 * FCM Token Repository
 * 
 * Handles FCM token lifecycle: registration, refresh, and unregistration.
 * Coordinates with backend API to keep token synchronized.
 */
class FCMTokenRepository(private val context: Context) {

    private val authSessionManager = AuthSessionManager(context)
    private val apiService = ApiClient.apiService
    private val TAG = "FCMTokenRepository"

    /**
     * Register FCM token with backend
     * Called on app start when courier is logged in
     */
    suspend fun registerTokenIfLoggedIn(): Result<Unit> {
        return withContext(Dispatchers.IO) {
            try {
                // Check if courier is logged in
                val isLoggedIn = authSessionManager.isLoggedIn.first()
                if (!isLoggedIn) {
                    Log.d(TAG, "Courier not logged in, skipping FCM registration")
                    return@withContext Result.success(Unit) // Not an error, just not logged in
                }

                val session = authSessionManager.getSession()
                if (session == null) {
                    Log.e(TAG, "Session data unavailable despite isLoggedIn=true")
                    return@withContext Result.failure(Exception("Session data unavailable"))
                }

                val token = getFCMToken()
                if (token == null) {
                    Log.e(TAG, "Failed to get FCM token")
                    return@withContext Result.failure(Exception("FCM token unavailable"))
                }

                val request = FCMTokenRequest(
                    courierId = session.courierId,
                    fcmToken = token,
                    deviceId = getDeviceId(),
                    platform = "android",
                    appVersion = getAppVersion()
                )

                val response = apiService.registerFCMToken(session.authToken, request)
                
                if (response.isSuccessful) {
                    Log.d(TAG, "FCM token registered successfully")
                    Result.success(Unit)
                } else {
                    Log.e(TAG, "Failed to register token: ${response.code()}")
                    Result.failure(Exception("Registration failed: ${response.code()}"))
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error registering FCM token", e)
                Result.failure(e)
            }
        }
    }

    /**
     * Unregister FCM token from backend
     * Called when courier logs out
     */
    suspend fun unregisterToken(): Result<Unit> {
        return withContext(Dispatchers.IO) {
            try {
                val isLoggedIn = authSessionManager.isLoggedIn.first()
                if (!isLoggedIn) {
                    Log.d(TAG, "Courier not logged in, nothing to unregister")
                    return@withContext Result.success(Unit)
                }

                val session = authSessionManager.getSession()
                if (session == null) {
                    return@withContext Result.success(Unit)
                }

                val token = getFCMToken() ?: return@withContext Result.failure(
                    Exception("No FCM token to unregister")
                )

                val request = FCMTokenRequest(
                    courierId = session.courierId,
                    fcmToken = token,
                    deviceId = getDeviceId()
                )

                val response = apiService.unregisterFCMToken(session.authToken, request)
                
                if (response.isSuccessful) {
                    Log.d(TAG, "FCM token unregistered successfully")
                    Result.success(Unit)
                } else {
                    Result.failure(Exception("Unregistration failed: ${response.code()}"))
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error unregistering FCM token", e)
                Result.failure(e)
            }
        }
    }

    /**
     * Get current FCM token
     */
    suspend fun getFCMToken(): String? {
        return try {
            FirebaseMessaging.getInstance().token.await()
        } catch (e: Exception) {
            Log.e(TAG, "Error getting FCM token", e)
            null
        }
    }

    /**
     * Get unique device identifier
     */
    private fun getDeviceId(): String {
        return Settings.Secure.getString(
            context.contentResolver,
            Settings.Secure.ANDROID_ID
        )
    }

    /**
     * Get app version
     */
    private fun getAppVersion(): String {
        return try {
            context.packageManager.getPackageInfo(context.packageName, 0).versionName ?: "1.0.0"
        } catch (e: Exception) {
            "1.0.0"
        }
    }
}
