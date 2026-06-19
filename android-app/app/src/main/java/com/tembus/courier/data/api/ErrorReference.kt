package com.tembus.courier.data.api

import retrofit2.Response

@Suppress("UNUSED_PARAMETER")
fun String.withRequestReference(response: Response<*>): String {
    // Referensi tidak perlu ditampilkan di UI aplikasi kurir
    return this
}
