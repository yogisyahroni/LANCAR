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
        val token = runBlocking { sessionManager.authToken.first() }

        val originalRequest = chain.request()

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
}
