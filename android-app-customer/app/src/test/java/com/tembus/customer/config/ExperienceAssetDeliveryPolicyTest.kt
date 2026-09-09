package com.tembus.customer.config

import com.tembus.customer.data.config.ExperienceAssetDeliveryPolicy
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ExperienceAssetDeliveryPolicyTest {
    @Test
    fun contentTypeMustMatchDeclaredMediaFamily() {
        assertTrue(ExperienceAssetDeliveryPolicy.contentTypeMatches("image", "image/webp", "image/webp; charset=binary"))
        assertFalse(ExperienceAssetDeliveryPolicy.contentTypeMatches("image", "image/webp", "image/png"))
        assertFalse(ExperienceAssetDeliveryPolicy.contentTypeMatches("video", "image/webp", "image/webp"))
    }

    @Test
    fun byteLimitIsBoundedByManifestAndGlobalMaximum() {
        assertTrue(ExperienceAssetDeliveryPolicy.withinByteLimit(100, 1_000))
        assertFalse(ExperienceAssetDeliveryPolicy.withinByteLimit(1_001, 1_000))
        assertFalse(ExperienceAssetDeliveryPolicy.withinByteLimit(1, ExperienceAssetDeliveryPolicy.MAX_ASSET_BYTES + 1))
    }

    @Test
    fun dimensionsAndAspectRatioAreVerifiedWhenDeclared() {
        assertTrue(ExperienceAssetDeliveryPolicy.dimensionsMatch(1200, 675, 1200, 675, 1200.0 / 675.0))
        assertFalse(ExperienceAssetDeliveryPolicy.dimensionsMatch(1200, 600, 1200, 675, 2.0))
        assertFalse(ExperienceAssetDeliveryPolicy.dimensionsMatch(1200, 675, null, null, 1.0))
    }
}
