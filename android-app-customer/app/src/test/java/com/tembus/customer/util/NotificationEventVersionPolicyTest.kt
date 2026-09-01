package com.tembus.customer.util

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NotificationEventVersionPolicyTest {
    @Test
    fun onlyNewerNumericEventsAreAccepted() {
        assertTrue(shouldAcceptNotificationEventVersion(null, "1"))
        assertTrue(shouldAcceptNotificationEventVersion(1L, "2"))
        assertFalse(shouldAcceptNotificationEventVersion(2L, "2"))
        assertFalse(shouldAcceptNotificationEventVersion(3L, "2"))
    }

    @Test
    fun legacyOrMalformedVersionsRemainBackwardCompatible() {
        assertTrue(shouldAcceptNotificationEventVersion(10L, null))
        assertTrue(shouldAcceptNotificationEventVersion(10L, "legacy"))
    }
}
