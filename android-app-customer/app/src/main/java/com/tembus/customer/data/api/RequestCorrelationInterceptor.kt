package com.tembus.customer.data.api

import okhttp3.Interceptor
import okhttp3.Response
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class RequestCorrelationInterceptor @Inject constructor(
    private val requestReferenceStore: NetworkRequestReferenceStore
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val generatedRequestId = UUID.randomUUID().toString()
        val request = chain.request().newBuilder()
            .header("X-Request-ID", generatedRequestId)
            .build()

        val response = chain.proceed(request)
        if (!response.isSuccessful) {
            requestReferenceStore.recordErrorRequestId(
                response.header("X-Request-ID") ?: generatedRequestId
            )
        } else {
            requestReferenceStore.clear()
        }

        return response
    }
}
