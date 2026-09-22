package com.tembus.customer.ui.screens.service

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ServiceLocationPolicyTest {
    @Test
    fun `accepts real coordinates`() {
        assertTrue(hasUsableServiceLocation(-6.2, 106.8))
    }

    @Test
    fun `rejects neutral and out of range coordinates`() {
        assertFalse(hasUsableServiceLocation(0.0, 0.0))
        assertFalse(hasUsableServiceLocation(-6.2, 0.0))
        assertFalse(hasUsableServiceLocation(91.0, 106.8))
    }
}
