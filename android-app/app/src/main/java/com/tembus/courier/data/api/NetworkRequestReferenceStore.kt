package com.tembus.courier.data.api

import com.google.firebase.crashlytics.FirebaseCrashlytics
import java.util.Locale
import javax.inject.Inject
import javax.inject.Singleton

private const val CRASHLYTICS_LAST_BACKEND_REQUEST_ID = "last_backend_request_id"
private const val CRASHLYTICS_NO_BACKEND_REQUEST_ID = "none"

@Singleton
class NetworkRequestReferenceStore @Inject constructor() {
    @Volatile
    private var lastErrorRequestId: String? = null

    fun recordErrorRequestId(requestId: String?) {
        val sanitizedRequestId = requestId?.trim()?.takeIf { it.isNotBlank() }
        lastErrorRequestId = sanitizedRequestId
        setCrashlyticsRequestId(sanitizedRequestId)
    }

    fun clear() {
        lastErrorRequestId = null
        setCrashlyticsRequestId(null)
    }

    fun lastErrorReference(): String? {
        return lastErrorRequestId?.toSupportReference()
    }

    private fun setCrashlyticsRequestId(requestId: String?) {
        runCatching {
            FirebaseCrashlytics.getInstance().setCustomKey(
                CRASHLYTICS_LAST_BACKEND_REQUEST_ID,
                requestId ?: CRASHLYTICS_NO_BACKEND_REQUEST_ID,
            )
        }
    }
}

internal fun String.toSupportReference(): String {
    val compactId = trim()
        .takeIf { it.isNotBlank() }
        ?.takeLast(12)
        ?.uppercase(Locale.US)
        ?: return "ref-unavailable"
    return "Ref $compactId"
}
