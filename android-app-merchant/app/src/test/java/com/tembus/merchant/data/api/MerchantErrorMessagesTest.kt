package com.tembus.merchant.data.api

import java.io.IOException
import org.junit.Assert.assertEquals
import org.junit.Test

class MerchantErrorMessagesTest {
    @Test
    fun hidesInfrastructureDetailsFromConnectionErrors() {
        assertEquals(
            "Koneksi bermasalah. Periksa internet lalu coba lagi.",
            MerchantErrorMessages.from(
                IOException("Unable to resolve host api.bawain.my.id"),
                "Gagal memuat data."
            )
        )
    }

    @Test
    fun mapsAuthenticationAndMissingDataToFriendlyCopy() {
        assertEquals(
            "Sesi Anda sudah berakhir. Silakan masuk kembali.",
            MerchantErrorMessages.from(Exception("HTTP 401 unauthorized"), "Gagal memuat data.")
        )
        assertEquals(
            "Data belum tersedia. Coba lagi atau hubungi admin toko.",
            MerchantErrorMessages.from(Exception("HTTP 404 not found"), "Gagal memuat data.")
        )
    }

    @Test
    fun usesSafeFallbackForUnknownFailures() {
        assertEquals(
            "Gagal memuat menu.",
            MerchantErrorMessages.from(Exception("internal database table detail"), "Gagal memuat menu.")
        )
    }
}
