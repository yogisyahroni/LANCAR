package com.tembus.merchant.ui.localization

import java.util.Locale
import org.junit.Assert.assertEquals
import org.junit.Test

class MerchantTextCatalogTest {
    @Test
    fun translatesCatalogCopyOnlyWhenEnglishIsSelected() {
        val original = Locale.getDefault()
        try {
            Locale.setDefault(Locale.ENGLISH)
            assertEquals("Save", MerchantTextCatalog.translate("Simpan"))
            assertEquals("Role: Kasir", MerchantTextCatalog.translate("Peran: Kasir"))
            assertEquals("15 minutes", MerchantTextCatalog.translate("15 menit"))
        } finally {
            Locale.setDefault(original)
        }
    }

    @Test
    fun keepsIndonesianCopyAndUnknownDynamicValuesIntactByDefault() {
        val original = Locale.getDefault()
        try {
            Locale.setDefault(Locale("id", "ID"))
            assertEquals("Simpan", MerchantTextCatalog.translate("Simpan"))
            assertEquals("Nama merchant dari backend", MerchantTextCatalog.translate("Nama merchant dari backend"))
        } finally {
            Locale.setDefault(original)
        }
    }
}
