package com.lancar.customer.data.api

import com.lancar.customer.data.session.AuthSessionManager
import kotlinx.coroutines.runBlocking
import okhttp3.Interceptor
import okhttp3.Response
import javax.inject.Inject

class TokenRefreshInterceptor @Inject constructor(
    private val sessionManager: AuthSessionManager
) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val response = chain.proceed(request)

        if (response.code == 401) {
            // Token expired or invalid, clear session to force logout
            runBlocking {
                sessionManager.clearSession()
            }
        }

        return response
    }
}
