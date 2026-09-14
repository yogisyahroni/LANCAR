package com.tembus.merchant.data.api

import java.util.Locale

/**
 * Keeps only a short sanitized error reference for the last failed request.  The
 * reference is safe for telemetry; response bodies, tokens and user content
 * never enter the metric label or crash context.
 */
class NetworkRequestReferenceStore {
    @Volatile
    private var lastErrorRequestId: String? = null

    fun recordErrorRequestId(requestId: String?) {
        lastErrorRequestId = requestId?.trim()?.takeIf { it.isNotBlank() }?.take(128)
    }

    fun clear() {
        lastErrorRequestId = null
    }

    fun lastErrorReference(): String? = lastErrorRequestId?.let {
        "Ref ${it.takeLast(12).uppercase(Locale.US)}"
    }
}
