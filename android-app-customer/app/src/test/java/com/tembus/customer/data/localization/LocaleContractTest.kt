package com.tembus.customer.data.localization

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class LocaleContractTest {
    @Test fun normalizesPersistedCodesAndBrowserTags() {
        assertEquals("id-ID", LocaleContract.normalizeLanguageTag("id"))
        assertEquals("en-US", LocaleContract.normalizeLanguageTag("en-AU"))
        assertEquals("id", LocaleContract.languageCode("unknown"))
    }

    @Test fun fallbackIsDeterministicAndDoesNotDuplicateLocales() {
        assertEquals(listOf("en-AU", "en", "id-ID", "id"), LocaleContract.fallbackChain("en-AU", "id-ID"))
    }

    @Test fun rtlDirectionIsAvailableBeforeMarketEnablement() {
        assertTrue(LocaleContract.isRtl("ar-SA"))
        assertTrue(!LocaleContract.isRtl("en-US"))
    }

    @Test fun formattersUseRequestedLocaleAndTimezone() {
        assertNotEquals(LocaleFormatters.number(1234567, "id-ID"), LocaleFormatters.number(1234567, "en-US"))
        assertTrue(LocaleFormatters.currency(12500, "IDR", "id-ID").isNotBlank())
        assertTrue(LocaleFormatters.dateTime(0L, "en-US", "UTC").isNotBlank())
        assertTrue(LocaleFormatters.address("Jl. Merdeka 1", "Kebayoran", "Jakarta", null, "12120", "Indonesia", "id-ID").contains("Jakarta"))
        assertEquals("+62 8123 4567 89", LocaleFormatters.phone("08123456789"))
    }
}
