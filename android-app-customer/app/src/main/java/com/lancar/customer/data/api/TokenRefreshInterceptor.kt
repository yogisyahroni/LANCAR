package com.lancar.customer.data.api

import com.lancar.customer.data.session.AuthSessionManager
import com.lancar.customer.data.session.SessionInvalidationReason
import kotlinx.coroutines.runBlocking
import okhttp3.Interceptor
import okhttp3.Response
import java.util.Locale
import javax.inject.Inject

class TokenRefreshInterceptor @Inject constructor(
    private val sessionManager: AuthSessionManager
) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val response = chain.proceed(request)

        if (shouldInvalidateSession(response)) {
            runBlocking {
                sessionManager.clearSession(SessionInvalidationReason.TOKEN_EXPIRED)
            }
        }

        return response
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

    private companion object {
        private const val MAX_AUTH_ERROR_BODY_BYTES = 2048L
    }
}
