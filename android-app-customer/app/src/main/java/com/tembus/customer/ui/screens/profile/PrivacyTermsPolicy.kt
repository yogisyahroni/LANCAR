package com.tembus.customer.ui.screens.profile

/**
 * Resolve only a server-provided first-party legal path or HTTPS URL.
 * The customer app never invents a policy URL from a document type/version.
 */
internal fun resolveApprovedLegalUri(
    documentUri: String,
    apiBaseUrl: String,
    allowHttp: Boolean = false,
): String? {
    val raw = documentUri.trim()
    if (raw.isBlank() || raw.startsWith("//")) return null
    val candidate = if (raw.startsWith("/")) {
        val origin = apiBaseUrl.substringBefore("/api/v1").trimEnd('/')
        if (origin.isBlank()) return null
        origin + raw
    } else {
        raw
    }
    val scheme = candidate.substringBefore(":", missingDelimiterValue = "").lowercase()
    val authority = candidate.substringAfter("://", missingDelimiterValue = "")
        .substringBefore('/').trim()
    return candidate.takeIf {
        (scheme == "https" || allowHttp && scheme == "http") && authority.isNotBlank() &&
            !authority.startsWith(".") && !authority.contains(' ')
    }
}
