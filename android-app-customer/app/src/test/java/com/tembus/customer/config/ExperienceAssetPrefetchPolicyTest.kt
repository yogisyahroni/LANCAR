package com.tembus.customer.config

import com.tembus.customer.data.config.ExperienceAssetPrefetchPolicy
import com.tembus.customer.data.config.model.ExperienceAssetReference
import com.tembus.customer.data.config.model.ExperienceManifest
import com.tembus.customer.data.config.model.ExperienceSection
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

class ExperienceAssetPrefetchPolicyTest {
    @Test
    fun selectsOnlyReferencedAssetsInTheNearTerm() {
        val now = Instant.parse("2026-09-09T00:00:00Z").toEpochMilli()
        val manifest = manifest(
            startsAt = Instant.ofEpochMilli(now + 60 * 60 * 1000).toString(),
            assets = listOf(asset("hero"), asset("unused")),
        )

        assertEquals(listOf("hero"), ExperienceAssetPrefetchPolicy.eligibleAssets(manifest, now).map { it.assetId })
    }

    @Test
    fun rejectsManifestsOutsideThePrefetchWindow() {
        val now = Instant.parse("2026-09-09T00:00:00Z").toEpochMilli()
        val manifest = manifest(
            startsAt = Instant.ofEpochMilli(now + ExperienceAssetPrefetchPolicy.PREFETCH_WINDOW_MILLIS + 1).toString(),
            assets = listOf(asset("hero")),
        )

        assertTrue(ExperienceAssetPrefetchPolicy.eligibleAssets(manifest, now).isEmpty())
    }

    @Test
    fun dataSaverUsesLighterFallbackPolicy() {
        assertTrue(ExperienceAssetPrefetchPolicy.shouldPreferFallback(isMetered = true, dataSaverEnabled = false))
        assertTrue(ExperienceAssetPrefetchPolicy.shouldPreferFallback(isMetered = false, dataSaverEnabled = true))
    }

    private fun manifest(startsAt: String, assets: List<ExperienceAssetReference>) = ExperienceManifest(
        manifestId = "manifest-1",
        schemaVersion = 1,
        revision = 1,
        marketCode = "id-jk",
        locale = "id-ID",
        surface = "customer_android",
        minAppVersion = "1.0.0",
        startsAt = startsAt,
        sections = listOf(
            ExperienceSection(
                id = "hero",
                component = "hero_banner",
                properties = buildJsonObject { put("image_asset_id", "hero") },
            ),
        ),
        assetReferences = assets,
        checksum = "a".repeat(64),
    )

    private fun asset(id: String) = ExperienceAssetReference(
        assetId = id,
        uri = "https://cdn.example.com/$id.webp",
        kind = "image",
        checksum = "b".repeat(64),
        contentType = "image/webp",
    )
}
