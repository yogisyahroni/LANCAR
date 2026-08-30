package com.tembus.merchant.data.api

import com.tembus.merchant.data.session.AuthSessionManager
import com.tembus.merchant.data.session.SessionInvalidationReason
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import okhttp3.Interceptor
import okhttp3.Response

/**
 * Auth Interceptor — inject Bearer token ke Authorization header.
 * X-User-ID di-set oleh API Gateway setelah verifikasi JWT (pola Tembus).
 */
class AuthInterceptor(private val sessionManager: AuthSessionManager) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val originalRequest = chain.request()

        // Login, register, OTP, dan refresh adalah endpoint publik. Jangan
        // membawa bearer token lama ke request login; token yang sudah expired
        // atau dicabut dapat membuat auth-service menolak proses login baru.
        if (isPublicEndpoint(originalRequest.url.encodedPath)) {
            return chain.proceed(originalRequest)
        }

        val token = runBlocking { sessionManager.authToken.first() }

        if (token.isNullOrEmpty()) {
            return chain.proceed(originalRequest)
        }

        if (sessionManager.isTokenExpired(token)) {
            runBlocking {
                sessionManager.clearSession(SessionInvalidationReason.TOKEN_EXPIRED)
            }
            return chain.proceed(originalRequest)
        }

        val authorizedRequest = originalRequest.newBuilder()
            .header("Authorization", "Bearer $token")
            .header("Accept", "application/json")
            .build()

        return chain.proceed(authorizedRequest)
    }

    private fun isPublicEndpoint(path: String): Boolean =
        path.contains("/auth/") ||
            path == "/api/v1/system/latest-version" ||
            path == "/api/v1/config/runtime"
}
