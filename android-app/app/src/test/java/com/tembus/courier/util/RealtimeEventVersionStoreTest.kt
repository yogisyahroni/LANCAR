package com.tembus.courier.util

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RealtimeEventVersionStoreTest {
    @Test
    fun rejectsDuplicateAndOlderOrderEvents() {
        val store = RealtimeEventVersionStore()
        assertTrue(store.accept("order-1", "10"))
        assertFalse(store.accept("order-1", "10"))
        assertFalse(store.accept("order-1", "9"))
        assertTrue(store.accept("order-1", "11"))
    }

    @Test
    fun keepsUnversionedLegacyEventsCompatible() {
        val store = RealtimeEventVersionStore()
        assertTrue(store.accept("order-1", null))
    }
}
