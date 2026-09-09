package com.tembus.customer.navigation

import com.tembus.customer.ui.navigation.RemoteDeepLinkResolver
import com.tembus.customer.ui.navigation.RemoteDeepLinkTarget
import com.tembus.customer.ui.navigation.RemoteInternalDestination
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class RemoteDeepLinkResolverTest {
    @Test
    fun `resolves only compiled internal destinations`() {
        assertEquals(
            RemoteDeepLinkTarget.Internal(RemoteInternalDestination.FOOD_FAVORITES),
            RemoteDeepLinkResolver.resolve("lancar://food/favorites", null),
        )
        assertEquals(
            RemoteDeepLinkTarget.Internal(RemoteInternalDestination.ORDERS),
            RemoteDeepLinkResolver.resolve("/orders", null),
        )
        assertTrue(RemoteDeepLinkResolver.resolve("lancar://admin", null) is RemoteDeepLinkTarget.Invalid)
        assertTrue(RemoteDeepLinkResolver.resolve("/orders/123", null) is RemoteDeepLinkTarget.Invalid)
    }

    @Test
    fun `accepts only exact first party https hosts`() {
        val target = RemoteDeepLinkResolver.resolve(null, "https://app.bawain.my.id/promo/1?source=home")
        assertTrue(target is RemoteDeepLinkTarget.External)
        assertEquals("https://app.bawain.my.id/promo/1?source=home", (target as RemoteDeepLinkTarget.External).url)
        assertTrue(RemoteDeepLinkResolver.resolve(null, "http://app.bawain.my.id/promo") is RemoteDeepLinkTarget.Invalid)
        assertTrue(RemoteDeepLinkResolver.resolve(null, "https://evil.example/promo") is RemoteDeepLinkTarget.Invalid)
        assertTrue(RemoteDeepLinkResolver.resolve(null, "https://app.bawain.my.id@evil.example/promo") is RemoteDeepLinkTarget.Invalid)
    }

    @Test
    fun `rejects multiple targets and unsafe path forms`() {
        assertTrue(
            RemoteDeepLinkResolver.resolve("/promo", "https://app.bawain.my.id/promo") is RemoteDeepLinkTarget.Invalid,
        )
        assertTrue(RemoteDeepLinkResolver.resolve("/../promo", null) is RemoteDeepLinkTarget.Invalid)
        assertTrue(RemoteDeepLinkResolver.resolve(null, "https://app.bawain.my.id/%2e%2e/admin") is RemoteDeepLinkTarget.Invalid)
    }
}
