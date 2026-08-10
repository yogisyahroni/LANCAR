package com.tembus.merchant.data.api

import com.tembus.merchant.data.device.DeviceIdentityProvider
import com.tembus.merchant.data.model.RefreshTokenRequest
import com.tembus.merchant.data.session.AuthSessionManager
import com.tembus.merchant.data.session.SessionInvalidationReason
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import okhttp3.Authenticator
import okhttp3.Request
import okhttp3.Response
import okhttp3.Route

/**
 * TokenAuthenticator — ADR-004: auto-refresh JWT saat response 401.
 *
 * Alur: 401 → ambil refresh_token tersimpan → POST /api/v1/auth/refresh (via service
 * khusus TANPA AuthInterceptor, hindari loop) → simpan token baru → retry request
 * original sekali. Gagal refresh → clearSession(TOKEN_EXPIRED) → UI kembali ke login.
 *
 * Mutex mencegah double-refresh saat beberapa request 401 paralel (missile sync).
 */
class TokenAuthenticator(
    private val sessionManager: AuthSessionManager,
    private val deviceIdentityProvider: DeviceIdentityProvider,
    private val refreshService: TEMBUSApiService
) : Authenticator {

    private val mutex = Mutex()

    override fun authenticate(route: Route?, response: Response): Request? {
        val request = response.request

        // Jangan retry endpoint refresh itu sendiri (hindari infinite loop).
        if (request.url.encodedPath.contains("/auth/refresh")) return null

        val sentAuth = request.header("Authorization")
        val sentToken = sentAuth?.removePrefix("Bearer ").orEmpty()
        if (sentToken.isEmpty()) return null

        // Token yang dipakai request gagal bukan token sekarang → request paralel lain
        // sudah refresh; langsung retry dengan token baru tanpa refresh lagi.
        if (sessionManager.getAuthTokenSync() != sentToken) {
            val latest = sessionManager.getAuthTokenSync() ?: return null
            return request.newBuilder()
                .header("Authorization", "Bearer $latest")
                .build()
        }

        return runBlocking {
            val refreshed = mutex.withLock { doRefresh() }
            if (!refreshed) {
                sessionManager.clearSession(SessionInvalidationReason.TOKEN_EXPIRED)
                return@runBlocking null
            }
            val newToken = sessionManager.getAuthTokenSync() ?: return@runBlocking null
            request.newBuilder()
                .header("Authorization", "Bearer $newToken")
                .build()
        }
    }

    private suspend fun doRefresh(): Boolean {
        return try {
            val refreshToken = sessionManager.getRefreshTokenSync()
            if (refreshToken.isNullOrBlank()) return false

            val resp = refreshService.refreshToken(
                RefreshTokenRequest(
                    refreshToken = refreshToken,
                    deviceId = deviceIdentityProvider.deviceId()
                )
            )
            if (!resp.isSuccessful) return false

            val auth = resp.body() ?: return false
            val newAccess = auth.accessToken ?: auth.data?.token ?: return false
            // Rotasi refresh token bila backend memberikannya; kalau tidak, pertahankan lama.
            val newRefresh = auth.refreshToken ?: refreshToken
            sessionManager.updateTokens(newAccess, newRefresh)
            true
        } catch (e: Exception) {
            false
        }
    }
}
