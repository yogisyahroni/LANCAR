package com.tembus.courier.data.localization

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class LocaleContractTest {
    @Test fun normalizesAndFallsBackSafely() {
        assertEquals("en-US", LocaleContract.normalizeLanguageTag("en-GB"))
        assertEquals("id", LocaleContract.languageCode("ar"))
        assertEquals(listOf("ar-SA", "ar", "id-ID", "id"), LocaleContract.fallbackChain("ar-SA", "id-ID"))
    }

    @Test fun supportsRtlAndLocaleAwareFormatting() {
        assertTrue(LocaleContract.isRtl("ar-SA"))
        assertNotEquals(LocaleFormatters.number(9876543, "id-ID"), LocaleFormatters.number(9876543, "en-US"))
        assertTrue(LocaleFormatters.currency(35000, "IDR", "en-US").isNotBlank())
        assertTrue(LocaleFormatters.date(0L, "id-ID", "UTC").isNotBlank())
        assertTrue(LocaleFormatters.time(0L, "en-US", "UTC").isNotBlank())
        assertEquals("+62 8123 4567 89", LocaleFormatters.phone("08123456789"))
    }
}
