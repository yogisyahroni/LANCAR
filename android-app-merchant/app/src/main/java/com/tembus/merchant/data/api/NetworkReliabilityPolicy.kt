package com.tembus.merchant.data.api

import okhttp3.Interceptor
import okhttp3.Response
import java.io.IOException

/**
 * Merchant network policy: only read/snapshot requests may receive a single
 * transparent retry. Order acknowledgements, menu mutations, payouts and
 * uploads require explicit server idempotency and are never auto-replayed.
 */
object NetworkReliabilityPolicy {
    const val CALL_TIMEOUT_SECONDS = 60L
    const val CONNECT_TIMEOUT_SECONDS = 30L
    const val READ_TIMEOUT_SECONDS = 30L
    const val WRITE_TIMEOUT_SECONDS = 30L
    const val MAX_SAFE_GET_RETRIES = 1

    fun isSafeRead(method: String): Boolean = method == "GET" || method == "HEAD"

    fun shouldRetrySafeRead(method: String, attempt: Int, callCanceled: Boolean): Boolean =
        isSafeRead(method) && !callCanceled && attempt < MAX_SAFE_GET_RETRIES

    fun canRetryMutation(idempotencyKey: String?, replaySafe: Boolean): Boolean =
        replaySafe && !idempotencyKey.isNullOrBlank()

    fun isRetryableReadFailure(code: Int): Boolean =
        code == 408 || code == 425 || code == 429 || code == 500 || code == 502 || code == 503 || code == 504
}

class SafeGetRetryInterceptor : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        if (!NetworkReliabilityPolicy.isSafeRead(request.method)) {
            return chain.proceed(request)
        }

        var attempt = 0
        var lastTransportError: IOException? = null
        while (attempt <= NetworkReliabilityPolicy.MAX_SAFE_GET_RETRIES) {
            try {
                val response = chain.proceed(request)
                if (!NetworkReliabilityPolicy.isRetryableReadFailure(response.code) ||
                    !NetworkReliabilityPolicy.shouldRetrySafeRead(request.method, attempt, chain.call().isCanceled())
                ) {
                    return response
                }
                response.close()
            } catch (error: IOException) {
                lastTransportError = error
                if (!NetworkReliabilityPolicy.shouldRetrySafeRead(request.method, attempt, chain.call().isCanceled())) throw error
            }
            attempt++
        }
        throw lastTransportError ?: IOException("safe read retry exhausted")
    }
}
