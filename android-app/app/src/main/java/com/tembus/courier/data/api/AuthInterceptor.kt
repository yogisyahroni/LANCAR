package com.tembus.courier.data.api

import com.tembus.courier.BuildConfig
import com.tembus.courier.data.session.AuthSessionManager
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
        val clientRequest = originalRequest.newBuilder()
            .header("X-App-Type", "courier")
            .header("X-App-Platform", "android")
            .header("X-App-Version", BuildConfig.VERSION_NAME)
            .header("X-App-Version-Code", BuildConfig.VERSION_CODE.toString())
            .header("X-App-Schema-Version", "1")
            .header("X-App-Capabilities", "orders,food,tracking,proof,payouts")
        
        // If token is missing, proceed with original request (e.g. for login/otp)
        if (token.isNullOrEmpty()) {
            return chain.proceed(clientRequest.build())
        }

        // Add Authorization header securely
        val authorizedRequest = clientRequest
            .header("Authorization", "Bearer $token")
            .header("Accept", "application/json")
            .build()

        return chain.proceed(authorizedRequest)
    }
}
