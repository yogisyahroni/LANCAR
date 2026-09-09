package com.tembus.merchant.data.localization

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class LocaleContractTest {
    @Test fun normalizesLocaleAndBuildsFallbackChain() {
        assertEquals("id-ID", LocaleContract.normalizeLanguageTag("id-ID"))
        assertEquals("en-US", LocaleContract.normalizeLanguageTag("en"))
        assertEquals(listOf("en-NZ", "en", "id-ID", "id"), LocaleContract.fallbackChain("en-NZ", "id-ID"))
    }

    @Test fun formattingIsLocaleAwareAndRtlReady() {
        assertTrue(LocaleContract.isRtl("he-IL"))
        assertNotEquals(LocaleFormatters.number(1002003, "id-ID"), LocaleFormatters.number(1002003, "en-US"))
        assertTrue(LocaleFormatters.currency(99900, "IDR", "id-ID").isNotBlank())
        assertTrue(LocaleFormatters.dateTime(0L, "en-US", "UTC").isNotBlank())
        assertTrue(LocaleFormatters.address("Main Street 1", null, "Jakarta", null, "10110", "Indonesia", "en-US").contains("Jakarta"))
        assertEquals("+62 8123 4567 89", LocaleFormatters.phone("08123456789"))
    }
}
