package com.tembus.merchant.data.api

import okhttp3.Interceptor
import okhttp3.Response
import java.util.UUID

/** Adds a governed request identity and retains only a sanitized error reference. */
class RequestCorrelationInterceptor(
    private val requestReferenceStore: NetworkRequestReferenceStore,
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val requestId = UUID.randomUUID().toString()
        val response = chain.proceed(chain.request().newBuilder().header("X-Request-ID", requestId).build())
        if (response.isSuccessful) {
            requestReferenceStore.clear()
        } else {
            requestReferenceStore.recordErrorRequestId(response.header("X-Request-ID") ?: requestId)
        }
        return response
    }
}
