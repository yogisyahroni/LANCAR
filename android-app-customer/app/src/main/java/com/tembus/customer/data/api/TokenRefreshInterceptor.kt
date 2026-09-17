package com.tembus.customer.data.api

import com.tembus.customer.BuildConfig
import com.tembus.customer.data.device.DeviceIdentityProvider
import com.tembus.customer.data.session.AuthSessionManager
import com.tembus.customer.data.session.SessionInvalidationReason
import kotlinx.coroutines.runBlocking
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import org.json.JSONObject
import java.util.Locale
import java.util.concurrent.TimeUnit
import javax.inject.Inject

/**
 * Silent token refresh.
 *
 * Alur: request dengan Bearer mendapat 401/419 → coba POST /auth/refresh
 * sekali (refresh_token + device_id tersimpan) → simpan pasangan token baru →
 * ulangi request asli dengan token baru. Hanya bila refresh tidak bisa
 * dilakukan (tanpa refresh token) atau gagal, sesi dibersihkan dan 401
 * asli dikembalikan supaya UI menampilkan state login ulang.
 *
 * Tanpa ini, sesi customer mati total setiap access token kedaluwarsa
 * (~15 menit) dan semua polling realtime (tracking, dashboard) 401 abadi.
 */
class TokenRefreshInterceptor @Inject constructor(
    private val sessionManager: AuthSessionManager,
    private val deviceIdentityProvider: DeviceIdentityProvider,
) : Interceptor {

    private val refreshLock = Any()

    private val refreshClient: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(REFRESH_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .readTimeout(REFRESH_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .writeTimeout(REFRESH_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .build()
    }

    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val response = chain.proceed(request)

        if (!shouldAttemptRefresh(response)) {
            if (shouldInvalidateSession(response)) {
                runBlocking {
                    sessionManager.clearSession(SessionInvalidationReason.TOKEN_EXPIRED)
                }
            }
            return response
        }

        val newAccessToken = runBlocking { tryRefreshLocked(request) }
        if (newAccessToken.isNullOrBlank()) {
            runBlocking {
                sessionManager.clearSession(SessionInvalidationReason.TOKEN_EXPIRED)
            }
            return response
        }

        response.close()
        val retriedRequest = request.newBuilder()
            .header("Authorization", "Bearer $newAccessToken")
            .build()
        return chain.proceed(retriedRequest)
    }

    private fun shouldAttemptRefresh(response: Response): Boolean {
        val hasBearerToken = response.request.header("Authorization")?.startsWith("Bearer ") == true
        if (!hasBearerToken) return false
        if (isRefreshRequest(response.request)) return false
        return response.code == 401 || response.code == 419
    }

    private fun isRefreshRequest(request: Request): Boolean {
        return request.url.encodedPath.endsWith("/auth/refresh")
    }

    private fun shouldInvalidateSession(response: Response): Boolean {
        val hasBearerToken = response.request.header("Authorization")?.startsWith("Bearer ") == true
        if (!hasBearerToken) return false

        if (response.code == 401 || response.code == 419) return true
        if (response.code == 403) return false

        val responseText = runCatching {
            response.peekBody(MAX_AUTH_ERROR_BODY_BYTES).string().lowercase(Locale.US)
        }.getOrDefault("")

        return responseText.contains("token_expired") ||
            responseText.contains("token expired") ||
            responseText.contains("jwt expired") ||
            responseText.contains("session expired")
    }

    /**
     * Tukarkan refresh token dengan pasangan token baru. Dijalankan di dalam
     * [refreshLock] supaya hanya satu refresh concurrently; thread lain yang
     * menunggu memakai token hasil refresh bila access token-nya sudah berganti.
     */
    private suspend fun tryRefreshLocked(failedRequest: Request): String? {
        // Double-check di luar lock tidak memungkinkan (suspend); cek di dalam.
        val failedToken = failedRequest.header("Authorization")?.removePrefix("Bearer ")?.trim()
        synchronized(refreshLock) {
            val currentToken = sessionManager.getTokenSync()
            if (!currentToken.isNullOrBlank() && currentToken != failedToken) {
                // Thread lain sudah me-refresh selagi menunggu lock.
                return currentToken
            }
            val refreshToken = sessionManager.getRefreshTokenSync()
            if (refreshToken.isNullOrBlank()) return null
            val deviceId = runCatching { deviceIdentityProvider.deviceId() }.getOrDefault("")
            return performRefresh(refreshToken, deviceId)
        }
    }

    private fun performRefresh(refreshToken: String, deviceId: String): String? {
        return runCatching {
            val payload = JSONObject()
                .put("refresh_token", refreshToken)
                .put("device_id", deviceId)
                .toString()
                .toRequestBody("application/json".toMediaType())
            val url = BuildConfig.BASE_URL.trimEnd('/') + "/api/v1/auth/refresh"
            val refreshRequest = Request.Builder()
                .url(url)
                .post(payload)
                .header("Accept", "application/json")
                .build()
            refreshClient.newCall(refreshRequest).execute().use { refreshResponse ->
                if (!refreshResponse.isSuccessful) return null
                val body = refreshResponse.body?.string() ?: return null
                val json = JSONObject(body)
                val data = json.optJSONObject("data")
                val newAccessToken = when {
                    json.has("access_token") -> json.optString("access_token")
                    data != null -> data.optString("token")
                    else -> ""
                }.trim()
                val newRefreshToken = when {
                    json.has("refresh_token") -> json.optString("refresh_token")
                    else -> ""
                }.trim()
                if (newAccessToken.isBlank()) return null
                val userObject = json.optJSONObject("user")
                val userName = userObject?.optString("full_name")?.takeIf { it.isNotBlank() }
                    ?: userObject?.optString("name")?.takeIf { it.isNotBlank() }
                    ?: data?.optString("name")?.takeIf { it.isNotBlank() }
                    ?: sessionManager.getCustomerNameSync()
                val customerId = userObject?.optString("id")?.takeIf { it.isNotBlank() }
                    ?: data?.optString("customer_id")?.takeIf { it.isNotBlank() }
                    ?: sessionManager.getUserIdSync().orEmpty()
                sessionManager.saveSessionSync(
                    token = newAccessToken,
                    id = customerId,
                    name = userName,
                    refreshToken = newRefreshToken.ifBlank { null },
                    deviceId = deviceId.ifBlank { null },
                )
                newAccessToken
            }
        }.getOrNull()
    }

    private companion object {
        private const val MAX_AUTH_ERROR_BODY_BYTES = 2048L
        private const val REFRESH_TIMEOUT_SECONDS = 15L
    }
}
