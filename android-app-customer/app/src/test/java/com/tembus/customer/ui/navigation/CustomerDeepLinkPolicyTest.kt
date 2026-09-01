package com.tembus.customer.ui.navigation

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class CustomerDeepLinkPolicyTest {
    @Test
    fun standardHostDeepLinksResolveToAuthoritativeOrderTargets() {
        assertEquals(CustomerDeepLinkTarget.OrderDetail("ORD-1"), resolveCustomerDeepLink("tembus", "orders", listOf("ORD-1")))
        assertEquals(CustomerDeepLinkTarget.Tracking("ORD-1"), resolveCustomerDeepLink("tembus", "orders", listOf("ORD-1", "tracking")))
        assertEquals(CustomerDeepLinkTarget.Chat("ORD-1"), resolveCustomerDeepLink("tembus", "orders", listOf("ORD-1", "chat")))
    }

    @Test
    fun legacyPathAndBookingLinksRemainSupported() {
        assertEquals(CustomerDeepLinkTarget.OrderDetail("ORD-2"), resolveCustomerDeepLink("tembus", null, listOf("orders", "ORD-2")))
        assertEquals(CustomerDeepLinkTarget.Booking("PROMO10"), resolveCustomerDeepLink("tembus", "booking", emptyList(), "PROMO10"))
        assertNull(resolveCustomerDeepLink("https", "orders", listOf("ORD-3")))
        assertNull(resolveCustomerDeepLink("tembus", "orders", listOf("ORD-3", "external")))
    }
}
