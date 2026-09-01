package com.tembus.courier.ui.screens

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CourierOfferPolicyTest {
    @Test
    fun remainingSecondsNeverBecomesNegative() {
        assertEquals(12, offerRemainingSeconds(20_000L, 8_001L))
        assertEquals(1, offerRemainingSeconds(20_000L, 19_001L))
        assertEquals(0, offerRemainingSeconds(20_000L, 20_000L))
        assertEquals(0, offerRemainingSeconds(20_000L, 30_000L))
    }

    @Test
    fun expiredOrCapacityBlockedOffersCannotBeAccepted() {
        assertTrue(offerCanAccept(20_000L, 19_001L, acceptBlocked = false))
        assertFalse(offerCanAccept(20_000L, 20_000L, acceptBlocked = false))
        assertFalse(offerCanAccept(20_000L, 19_001L, acceptBlocked = true))
    }
}
