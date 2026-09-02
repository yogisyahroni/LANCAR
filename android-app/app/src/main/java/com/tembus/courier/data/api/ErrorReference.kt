package com.tembus.courier.data.api

import retrofit2.Response

@Suppress("UNUSED_PARAMETER")
fun String.withRequestReference(response: Response<*>): String {
    // Referensi tidak perlu ditampilkan di UI aplikasi kurir
    return this
}

fun String.withRecoverableNextAction(code: String?): String {
    val action = when (code) {
        "REQUOTE_REQUIRED", "CARRIER_RATE_EXPIRED" -> "Tinjau tarif terbaru lalu lanjutkan."
        "OUT_OF_SERVICE_AREA" -> "Pilih alamat lain yang masih terjangkau layanan."
        "NO_COURIER" -> "Coba lagi beberapa saat atau pilih layanan lain."
        "PROVIDER_UNAVAILABLE" -> "Pilih provider atau layanan lain."
        "ITEM_UNAVAILABLE" -> "Hapus item yang tidak tersedia atau pilih pengganti."
        "INVALID_TRANSITION" -> "Muat ulang status terbaru sebelum mencoba lagi."
        "PAYMENT_PENDING" -> "Tunggu konfirmasi pembayaran sebelum mengulangi aksi."
        "PROOF_REQUIRED" -> "Lengkapi bukti yang diwajibkan lalu kirim ulang."
        "HANDOFF_INVALID" -> "Minta kode serah-terima baru lalu ulangi verifikasi."
        "SCHEDULE_INVALID" -> "Pilih jadwal yang masih tersedia."
        "CAPABILITY_MISMATCH" -> "Pilih layanan yang sesuai kemampuan akun."
        "CARRIER_EVENT_UNKNOWN" -> "Muat ulang pelacakan atau hubungi dukungan."
        else -> null
    } ?: return this
    return if (contains(action, ignoreCase = true)) this else "$this $action"
}
