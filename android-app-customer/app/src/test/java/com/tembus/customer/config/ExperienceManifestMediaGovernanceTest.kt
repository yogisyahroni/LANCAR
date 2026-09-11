package com.tembus.customer.config

import com.tembus.customer.data.config.model.ExperienceAssetReference
import com.tembus.customer.data.config.model.ExperienceConfigScope
import com.tembus.customer.data.config.model.ExperienceManifest
import com.tembus.customer.data.config.model.ExperienceManifestValidator
import com.tembus.customer.data.config.model.ExperienceSection
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

class ExperienceManifestMediaGovernanceTest {
    private val scope = ExperienceConfigScope(
        marketCode = "id-jk",
        locale = "id-ID",
        appVersion = "1.5.0",
    )

    @Test
    fun heroAssetMustMatchPresetAndCreativeChromeIsDropped() {
        val valid = ExperienceManifestValidator.sanitize(
            manifest(assetAspectRatio = 16.0 / 9.0),
            scope,
        )

        assertNotNull(valid)
        val properties = requireNotNull(valid).sections.single().properties
        assertTrue("button_style" !in properties)
        assertNull(
            ExperienceManifestValidator.sanitize(
                manifest(assetAspectRatio = 1.0),
                scope,
            ),
        )
    }

    @Test
    fun animatedCampaignAssetRequiresCompatibleStaticFallback() {
        val animatedAsset = asset(
            id = "campaign-animation",
            kind = "animation",
            aspectRatio = 16.0 / 9.0,
            fallbackAssetId = "campaign-static",
        )
        val staticAsset = asset(
            id = "campaign-static",
            kind = "image",
            aspectRatio = 16.0 / 9.0,
        )
        val manifest = manifest(
            component = "campaign_intro",
            properties = buildJsonObject {
                put("campaign_id", "ramadan-2026")
                put("title", "Ramadan")
                put("media_asset_id", "campaign-animation")
            },
            assets = listOf(animatedAsset, staticAsset),
        )

        assertNotNull(ExperienceManifestValidator.sanitize(manifest, scope))
        assertNull(
            ExperienceManifestValidator.sanitize(
                manifest.copy(assetReferences = listOf(animatedAsset.copy(fallbackAssetId = null), staticAsset)),
                scope,
            ),
        )
    }

    private fun manifest(
        component: String = "hero_banner",
        properties: kotlinx.serialization.json.JsonObject = buildJsonObject {
            put("title", "Campaign")
            put("image_asset_id", "hero-image")
            put("button_style", "fake-system-button")
        },
        assetAspectRatio: Double? = 16.0 / 9.0,
        assets: List<ExperienceAssetReference> = listOf(asset("hero-image", "image", assetAspectRatio)),
    ) = ExperienceManifest(
        manifestId = "11111111-1111-4111-8111-111111111111",
        schemaVersion = 1,
        revision = 1,
        marketCode = "id-jk",
        locale = "id-ID",
        surface = "customer_android",
        minAppVersion = "1.0.0",
        startsAt = Instant.now().minusSeconds(60).toString(),
        ttlSeconds = 300,
        cachePolicy = "private",
        sections = listOf(ExperienceSection("campaign", component, properties)),
        assetReferences = assets,
        checksum = "a".repeat(64),
    )

    private fun asset(
        id: String,
        kind: String,
        aspectRatio: Double?,
        fallbackAssetId: String? = null,
    ) = ExperienceAssetReference(
        assetId = id,
        uri = "https://cdn.example.test/$id.webp",
        kind = kind,
        checksum = "b".repeat(64),
        contentType = "image/webp",
        aspectRatio = aspectRatio,
        fallbackAssetId = fallbackAssetId,
    )
}
