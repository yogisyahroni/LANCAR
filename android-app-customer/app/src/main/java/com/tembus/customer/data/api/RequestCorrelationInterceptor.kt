package com.tembus.customer.data.api

import okhttp3.Interceptor
import okhttp3.Response
import java.io.IOException
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class RequestCorrelationInterceptor @Inject constructor(
    private val requestReferenceStore: NetworkRequestReferenceStore,
    private val mobileTelemetry: com.tembus.customer.util.MobileTelemetry,
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val generatedRequestId = UUID.randomUUID().toString()
        val path = chain.request().url.encodedPath
        val request = chain.request().newBuilder()
            .header("X-Request-ID", generatedRequestId)
            .build()

        return try {
            val response = chain.proceed(request)
            if (!response.isSuccessful) {
                requestReferenceStore.recordErrorRequestId(
                    response.header("X-Request-ID") ?: generatedRequestId
                )
            } else {
                requestReferenceStore.clear()
            }
            mobileTelemetry.apiRequest(
                path = path,
                statusCode = response.code,
                outcome = if (response.isSuccessful) "completed" else "failed",
            )
            response
        } catch (error: IOException) {
            mobileTelemetry.apiRequest(path = path, outcome = "failed")
            throw error
        }
    }
}
