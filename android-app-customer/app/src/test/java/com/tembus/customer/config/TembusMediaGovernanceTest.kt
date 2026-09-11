package com.tembus.customer.config

import com.tembus.customer.data.config.TembusMediaGovernance
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TembusMediaGovernanceTest {
    @Test
    fun exposesNamedPresetsForEveryCreativeSurface() {
        assertEquals(
            setOf("hero_banner", "merchant_card", "sponsored_card", "category_tile", "campaign_intro", "empty_state"),
            TembusMediaGovernance.presets.map { it.key }.toSet(),
        )
        assertEquals(16.0 / 9.0, TembusMediaGovernance.HeroBanner.aspectRatio, 0.001)
        assertEquals(4.0 / 3.0, TembusMediaGovernance.MerchantCard.aspectRatio, 0.001)
        assertEquals(1.0, TembusMediaGovernance.CategoryTile.aspectRatio, 0.001)
    }

    @Test
    fun componentRatioAndSafeZoneAreBounded() {
        assertTrue(TembusMediaGovernance.acceptsAspectRatio("hero_banner", 16.0 / 9.0))
        assertFalse(TembusMediaGovernance.acceptsAspectRatio("hero_banner", 1.0))
        assertTrue(TembusMediaGovernance.isValidSafeTextZone("none"))
        assertTrue(TembusMediaGovernance.isValidSafeTextZone(null))
        assertFalse(TembusMediaGovernance.isValidSafeTextZone("fake_button"))
    }

    @Test
    fun animatedAndVideoCreativeRequiresStaticImageFallback() {
        assertTrue(TembusMediaGovernance.requiresStaticFallback("animation"))
        assertTrue(TembusMediaGovernance.requiresStaticFallback("video"))
        assertFalse(TembusMediaGovernance.requiresStaticFallback("image"))
        assertTrue(TembusMediaGovernance.fallbackIsCompatible("animation", "image"))
        assertFalse(TembusMediaGovernance.fallbackIsCompatible("video", "video"))
    }
}
