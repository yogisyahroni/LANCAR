package com.tembus.customer.ui.localization

import org.junit.Assert.assertEquals
import org.junit.Test
import java.util.Locale

class CustomerTextCatalogTest {
    @Test
    fun translatesCommonCopyForEnglish() {
        withLocale(Locale.ENGLISH) {
            assertEquals("Orders", CustomerTextCatalog.translate("Pesanan"))
            assertEquals("Order #42", CustomerTextCatalog.translate("Pesanan #42"))
            assertEquals("5 minutes", CustomerTextCatalog.translate("5 menit"))
        }
    }

    @Test
    fun translatesAuditSurfaceCopyForEnglish() {
        withLocale(Locale.ENGLISH) {
            // UIUX-2026-004: dashboard, tambal, food, tracking.
            assertEquals("Balance ready to use", CustomerTextCatalog.translate("Saldo siap dipakai"))
            assertEquals("Instant Courier", CustomerTextCatalog.translate("Paket Instan"))
            assertEquals("Intercity Shipping", CustomerTextCatalog.translate("Ekspedisi Antar Kota"))
            assertEquals("Nearby technicians", CustomerTextCatalog.translate("Teknisi Terdekat"))
            assertEquals("Book This Technician", CustomerTextCatalog.translate("Pesan Teknisi Ini"))
            assertEquals("Search food", CustomerTextCatalog.translate("Cari makanan"))
            assertEquals("Confirm SOS", CustomerTextCatalog.translate("Konfirmasi SOS"))
        }
    }

    @Test
    fun keepsIndonesianCopyForIndonesianLocale() {
        withLocale(Locale("id", "ID")) {
            assertEquals("Pesanan", CustomerTextCatalog.translate("Pesanan"))
            assertEquals("5 menit", CustomerTextCatalog.translate("5 menit"))
        }
    }

    private fun <T> withLocale(locale: Locale, block: () -> T): T {
        val previous = Locale.getDefault()
        return try {
            Locale.setDefault(locale)
            block()
        } finally {
            Locale.setDefault(previous)
        }
    }
}
