package com.lancar.courier.data.api

import com.lancar.courier.data.session.AuthSessionManager
import okhttp3.Interceptor
import okhttp3.Response

/**
 * Performance-Optimized Auth Interceptor
 * 
 * Automatically injects the Bearer token into the Authorization header
 * of every outgoing request without blocking threads, using a synchronous 
 * in-memory token cache.
 */
class AuthInterceptor(private val sessionManager: AuthSessionManager) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        // ⚡ FAST IN-MEMORY CACHE LOOKUP (Eliminates legacy runBlocking I/O overhead)
        val token = sessionManager.getAuthTokenSync()

        val originalRequest = chain.request()
        
        // If token is missing, proceed with original request (e.g. for login/otp)
        if (token.isNullOrEmpty()) {
            return chain.proceed(originalRequest)
        }

        // Add Authorization header securely
        val authorizedRequest = originalRequest.newBuilder()
            .header("Authorization", "Bearer $token")
            .header("Accept", "application/json")
            .build()

        return chain.proceed(authorizedRequest)
    }
}
