package com.tembus.merchant.data.api

import com.tembus.merchant.util.MobileTelemetry
import okhttp3.Interceptor
import okhttp3.Response
import java.io.IOException
import java.util.UUID

/** Adds a governed request identity and retains only a sanitized error reference. */
class RequestCorrelationInterceptor(
    private val requestReferenceStore: NetworkRequestReferenceStore,
    private val mobileTelemetry: MobileTelemetry,
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val requestId = UUID.randomUUID().toString()
        val path = chain.request().url.encodedPath
        return try {
            val response = chain.proceed(chain.request().newBuilder().header("X-Request-ID", requestId).build())
            if (response.isSuccessful) {
                requestReferenceStore.clear()
            } else {
                requestReferenceStore.recordErrorRequestId(response.header("X-Request-ID") ?: requestId)
            }
            mobileTelemetry.apiRequest(path, response.code, if (response.isSuccessful) "completed" else "failed")
            response
        } catch (error: IOException) {
            mobileTelemetry.apiRequest(path, outcome = "failed")
            throw error
        }
    }
}
