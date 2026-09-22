package com.tembus.customer.ui.screens.food

import java.time.Instant
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FoodCheckoutPolicyTest {
    private val now = Instant.parse("2026-09-21T10:00:00Z")

    @Test
    fun `quote is valid until expiry boundary`() {
        assertFalse(FoodCheckoutPolicy.isQuoteExpired("2026-09-21T10:10:00Z", now))
        assertTrue(FoodCheckoutPolicy.isQuoteExpired("2026-09-21T10:00:00Z", now))
    }

    @Test
    fun `missing or malformed expiry is fail closed`() {
        assertTrue(FoodCheckoutPolicy.isQuoteExpired("", now))
        assertTrue(FoodCheckoutPolicy.isQuoteExpired("not-a-timestamp", now))
    }
}
