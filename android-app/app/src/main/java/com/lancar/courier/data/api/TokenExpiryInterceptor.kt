package com.lancar.courier.data.api

import android.util.Log
import com.lancar.courier.data.session.AuthSessionManager
import okhttp3.Interceptor
import okhttp3.Response

/**
 * Token Expiry Interceptor
 * 
 * Intercepts outgoing responses and inspects their HTTP code.
 * If response code is 401 (Unauthorized), automatically terminates the local user session
 * which triggers a reactive UI navigation back to the Login screen.
 */
class TokenExpiryInterceptor(private val sessionManager: AuthSessionManager) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val response = chain.proceed(request)

        if (response.code == 401) {
            Log.w("AUTH_EXPIRED", "Ditemukan 401 Unauthorized pada: ${request.url}. Memulai proses logout otomatis...")
            sessionManager.clearSessionSync()
        }

        return response
    }
}
