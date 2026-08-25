package com.tembus.customer.ui.screens.tracking

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Unit tests for pure tracking logic extracted from TrackingScreen.kt.
 * These functions have no Compose dependency, so they are exercised directly
 * (regression coverage for the god-file refactor — see TEMBUS_ROADMAP_TO_2026 §1.3).
 */
class TrackingScreenLogicTest {

    // --- eventMatchesStep -------------------------------------------------
    @Test
    fun eventMatchesStep_merchantOrder_acceptsMerchantEvents() {
        assertTrue(eventMatchesStep("pending_merchant", "merchant_order"))
        assertTrue(eventMatchesStep("order_accepted", "merchant_order"))
        assertFalse(eventMatchesStep("delivered", "merchant_order"))
    }

    @Test
    fun eventMatchesStep_pickup_acceptsPickupVerified() {
        assertTrue(eventMatchesStep("pickup_verified", "pickup"))
        assertTrue(eventMatchesStep("picked_up", "pickup"))
        assertFalse(eventMatchesStep("delivering", "pickup"))
    }

    @Test
    fun eventMatchesStep_delivery_acceptsInTransit() {
        assertTrue(eventMatchesStep("in_transit", "delivery"))
        assertTrue(eventMatchesStep("delivery_started", "delivery"))
        assertFalse(eventMatchesStep("pending_merchant", "delivery"))
    }

    @Test
    fun eventMatchesStep_unknownStep_returnsFalse() {
        assertFalse(eventMatchesStep("anything", "no_such_step"))
    }

    // --- formatTrackingDate -------------------------------------------------
    @Test
    fun formatTrackingDate_replacesTWithSpaceAndTruncates() {
        assertEquals("2026-08-26 14:30", formatTrackingDate("2026-08-26T14:30:00Z"))
        assertEquals("2026-08-26 14:30", formatTrackingDate("2026-08-26T14:30:55.123Z"))
    }

    // --- absoluteUploadUrl -------------------------------------------------
    @Test
    fun absoluteUploadUrl_blankReturnsEmpty() {
        assertEquals("", absoluteUploadUrl(null))
        assertEquals("", absoluteUploadUrl("   "))
    }

    @Test
    fun absoluteUploadUrl_httpPassthrough() {
        assertEquals("https://cdn.example.com/p.png", absoluteUploadUrl("https://cdn.example.com/p.png"))
        assertEquals("http://x/y.jpg", absoluteUploadUrl("http://x/y.jpg"))
    }

    @Test
    fun absoluteUploadUrl_relativePathPrefixedWithGatewayBase() {
        // BuildConfig.BASE_URL is fixed per build flavour; assert the relative
        // path is joined (not echoed verbatim) and starts with the gateway root.
        val result = absoluteUploadUrl("/uploads/proof.png")
        assertTrue("relative path should be prefixed, got=$result", result.endsWith("/uploads/proof.png"))
        assertTrue("result must not equal raw relative path", result != "/uploads/proof.png")
    }

    // --- trackingStageText -------------------------------------------------
    @Test
    fun trackingStageText_foodScheduled_hasFoodCopy() {
        assertTrue(trackingStageText("scheduled", "food")?.contains("merchant") == true)
    }

    @Test
    fun trackingStageText_towingAccepted_mentionsTowing() {
        assertTrue(trackingStageText("accepted", "towing")?.contains("towing", ignoreCase = true) == true)
    }

    @Test
    fun trackingStageText_delivered_usesCompletedLabel() {
        assertEquals("POD diterima", trackingStageText("delivered", "package"))
    }

    @Test
    fun trackingStageText_nullStatus_fallback() {
        assertTrue(trackingStageText(null, "package")?.contains("Menunggu") == true)
    }

    // --- trackingFreshnessLabel -------------------------------------------
    @Test
    fun trackingFreshnessLabel_null_returnsNeverSynced() {
        assertEquals("Data tracking belum pernah tersinkron", trackingFreshnessLabel(null))
    }

    @Test
    fun trackingFreshnessLabel_recentWithinSeconds() {
        val now = System.currentTimeMillis()
        assertTrue(trackingFreshnessLabel(now - 30_000)?.contains("30 detik") == true)
    }

    @Test
    fun trackingFreshnessLabel_overAnHour() {
        val now = System.currentTimeMillis()
        assertTrue(trackingFreshnessLabel(now - 5 * 60 * 60 * 1000)?.contains("lebih dari 1 jam") == true)
    }
}
