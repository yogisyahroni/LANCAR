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
