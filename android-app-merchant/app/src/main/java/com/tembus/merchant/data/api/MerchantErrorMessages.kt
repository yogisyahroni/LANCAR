package com.tembus.merchant.data.api

import java.util.Locale

/**
 * Converts transport/service failures into safe, actionable merchant copy.
 * Raw response bodies and infrastructure details must never reach the UI.
 */
object MerchantErrorMessages {
    fun from(error: Throwable?, fallback: String): String {
        val detail = error?.message.orEmpty().lowercase(Locale.ROOT)
        return when {
            detail.contains("401") || detail.contains("unauthorized") || detail.contains("unauthenticated") || detail.contains("token") ->
                "Sesi Anda sudah berakhir. Silakan masuk kembali."
            detail.contains("403") || detail.contains("forbidden") || detail.contains("permission") || detail.contains("izin") ->
                "Anda tidak memiliki izin untuk melakukan tindakan ini."
            detail.contains("404") || detail.contains("not found") || detail.contains("belum terdaftar") ->
                "Data belum tersedia. Coba lagi atau hubungi admin toko."
            detail.contains("408") || detail.contains("429") || detail.contains("timeout") || detail.contains("timed out") ->
                "Permintaan terlalu lama. Periksa koneksi lalu coba lagi."
            detail.contains("sudah terdaftar") || detail.contains("already registered") ->
                "Email atau nomor handphone sudah terdaftar. Silakan masuk dengan akun tersebut."
            detail.contains("connect") || detail.contains("socket") || detail.contains("resolve host") || detail.contains("network") ->
                "Koneksi bermasalah. Periksa internet lalu coba lagi."
            detail.contains("response kosong") || detail.contains("empty response") ->
                "Data belum lengkap. Coba lagi."
            else -> fallback
        }
    }
}
