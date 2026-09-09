package com.tembus.merchant.data.api

import com.tembus.merchant.BuildConfig
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
        val clientRequest = originalRequest.newBuilder()
            .header("X-App-Type", "merchant")
            .header("X-App-Platform", "android")
            .header("X-App-Version", BuildConfig.VERSION_NAME)
            .header("X-App-Version-Code", BuildConfig.VERSION_CODE.toString())
            .header("X-App-Schema-Version", "1")
            .header("X-App-Capabilities", "orders,menu,settlement,promotions")

        // Login, register, OTP, dan refresh adalah endpoint publik. Jangan
        // membawa bearer token lama ke request login; token yang sudah expired
        // atau dicabut dapat membuat auth-service menolak proses login baru.
        if (isPublicEndpoint(originalRequest.url.encodedPath)) {
            return chain.proceed(clientRequest.build())
        }

        val token = runBlocking { sessionManager.authToken.first() }

        if (token.isNullOrEmpty()) {
            return chain.proceed(clientRequest.build())
        }

        if (sessionManager.isTokenExpired(token)) {
            runBlocking {
                sessionManager.clearSession(SessionInvalidationReason.TOKEN_EXPIRED)
            }
            return chain.proceed(clientRequest.build())
        }

        val authorizedRequest = clientRequest
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
