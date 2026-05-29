package com.tembus.customer.data.api

import retrofit2.Response

fun String.withRequestReference(response: Response<*>): String {
    val requestId = response.headers()["X-Request-ID"]?.trim().orEmpty()
    if (requestId.isBlank()) return this

    val reference = requestId.toSupportReference()
    if (contains(reference, ignoreCase = true)) return this

    return "$this ($reference)"
}
