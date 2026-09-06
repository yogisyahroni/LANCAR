package com.tembus.courier.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class TambalBanReportPolicyTest {
    @Test
    fun `duration rounds partial minute up and never reports zero`() {
        assertEquals(1, calculateTambalBanDurationMinutes(1_000L, 1_001L))
        assertEquals(2, calculateTambalBanDurationMinutes(1_000L, 61_001L))
    }

    @Test
    fun `duration rejects missing reversed and over 24 hour clocks`() {
        assertNull(calculateTambalBanDurationMinutes(null, 10_000L))
        assertNull(calculateTambalBanDurationMinutes(10_000L, 9_999L))
        assertNull(calculateTambalBanDurationMinutes(1_000L, 1_000L + 24L * 60L * 60_000L + 1L))
    }
}
