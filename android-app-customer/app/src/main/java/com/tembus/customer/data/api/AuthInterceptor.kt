package com.tembus.customer.data.api

import com.tembus.customer.BuildConfig
import com.tembus.customer.data.session.AuthSessionManager
import com.tembus.customer.data.session.SessionInvalidationReason
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
        val clientRequest = originalRequest.newBuilder()
            .header("X-App-Type", "customer")
            .header("X-App-Platform", "android")
            .header("X-App-Version", BuildConfig.VERSION_NAME)
            .header("X-App-Version-Code", BuildConfig.VERSION_CODE.toString())
            .header("X-App-Schema-Version", "1")
            .header("X-App-Capabilities", "orders,food,tracking,payments")
        
        // If token is missing, proceed with original request (e.g. for login/otp)
        if (token.isNullOrEmpty()) {
            return chain.proceed(clientRequest.build())
        }

        if (sessionManager.isTokenExpired(token)) {
            runBlocking {
                sessionManager.clearSession(SessionInvalidationReason.TOKEN_EXPIRED)
            }
            return chain.proceed(clientRequest.build())
        }

        // Add Authorization header
        val authorizedRequest = clientRequest
            .header("Authorization", "Bearer $token")
            .header("Accept", "application/json")
            .build()

        return chain.proceed(authorizedRequest)
    }
}
