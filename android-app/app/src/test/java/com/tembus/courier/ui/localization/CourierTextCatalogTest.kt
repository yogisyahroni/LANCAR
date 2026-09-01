package com.tembus.courier.ui.localization

import org.junit.Assert.assertEquals
import org.junit.Test
import java.util.Locale

class CourierTextCatalogTest {
    @Test
    fun translatesCommonCopyForEnglish() {
        withLocale(Locale.ENGLISH) {
            assertEquals("Home", CourierTextCatalog.translate("Beranda"))
            assertEquals("Hello, Siti", CourierTextCatalog.translate("Halo, Siti"))
            assertEquals("5 minutes", CourierTextCatalog.translate("5 menit"))
        }
    }

    @Test
    fun keepsIndonesianCopyForIndonesianLocale() {
        withLocale(Locale("id", "ID")) {
            assertEquals("Beranda", CourierTextCatalog.translate("Beranda"))
            assertEquals("5 menit", CourierTextCatalog.translate("5 menit"))
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
