package com.lancar.courier.data.api

import com.lancar.courier.data.session.AuthSessionManager
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import okhttp3.Interceptor
import okhttp3.Response

/**
 * Auth Interceptor
 * 
 * Automatically injects the Bearer token into the Authorization header
 * of every outgoing request if the user is logged in.
 */
class AuthInterceptor(private val sessionManager: AuthSessionManager) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val token = runBlocking {
            sessionManager.authToken.first()
        }

        val originalRequest = chain.request()
        
        // If token is missing, proceed with original request (e.g. for login/otp)
        if (token.isNullOrEmpty()) {
            return chain.proceed(originalRequest)
        }

        // Add Authorization header
        val authorizedRequest = originalRequest.newBuilder()
            .header("Authorization", "Bearer $token")
            .header("Accept", "application/json")
            .build()

        return chain.proceed(authorizedRequest)
    }
}
