package com.tembus.customer.config

import com.tembus.customer.data.config.StartupCampaignRecord
import com.tembus.customer.data.config.model.ExperienceConfigScope
import com.tembus.customer.data.config.model.ExperienceConfigSnapshot
import com.tembus.customer.data.config.model.ExperienceConfigSource
import com.tembus.customer.data.config.model.ExperienceManifest
import com.tembus.customer.data.config.model.ExperienceSection
import com.tembus.customer.data.config.model.ExperienceAssetReference
import com.tembus.customer.domain.config.StartupCampaignPolicy
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

class StartupCampaignPolicyTest {
    private val scope = ExperienceConfigScope(
        marketCode = "id-jk",
        locale = "id-ID",
        appVersion = "1.5.0",
        cohort = "beta",
        experimentRef = "launch-test",
    )

    @Test
    fun validCampaignUsesLocalizedCachedCopyAndVerifiedLocalAsset() {
        val snapshot = snapshot(
            properties = campaignProperties(),
            assets = listOf(asset()),
            targeting = buildJsonObject {
                put("cohorts", kotlinx.serialization.json.buildJsonArray { add(kotlinx.serialization.json.JsonPrimitive("beta")) })
                put("experiment_ref", "launch-test")
            },
        )

        val decision = StartupCampaignPolicy.evaluate(
            snapshot = snapshot,
            resolveAssetPath = { "/data/user/0/com.tembus/files/experience-assets/launch-1/hero.webp" },
        )

        assertNotNull(decision)
        assertEquals("launch-2026", requireNotNull(decision).campaign.campaignId)
        assertEquals("/data/user/0/com.tembus/files/experience-assets/launch-1/hero.webp", decision.assetPath)
        assertEquals("Promo khusus untuk kamu", decision.campaign.title)
    }

    @Test
    fun missingOrCorruptAssetSkipsCampaign() {
        val snapshot = snapshot(properties = campaignProperties(), assets = listOf(asset()))

        assertNull(StartupCampaignPolicy.evaluate(snapshot, resolveAssetPath = { null }))
    }

    @Test
    fun disabledExpiredAndOutOfAudienceCampaignsAreSkipped() {
        val now = 1_700_000_000_000L
        assertNull(
            StartupCampaignPolicy.evaluate(
                snapshot(properties = campaignProperties(enabled = false)),
                nowMillis = now,
            ),
        )
        assertNull(
            StartupCampaignPolicy.evaluate(
                snapshot(properties = campaignProperties(), startsAt = Instant.ofEpochMilli(now + 60_000).toString()),
                nowMillis = now,
            ),
        )
        assertNull(
            StartupCampaignPolicy.evaluate(
                snapshot(properties = campaignProperties(), endsAt = Instant.ofEpochMilli(now - 1).toString()),
                nowMillis = now,
            ),
        )
        val wrongCohort = scope.copy(cohort = "control")
        assertNull(
            StartupCampaignPolicy.evaluate(
                snapshot(scope = wrongCohort, targeting = buildJsonObject {
                    put("cohorts", kotlinx.serialization.json.buildJsonArray { add(kotlinx.serialization.json.JsonPrimitive("beta")) })
                }),
                nowMillis = now,
            ),
        )
    }

    @Test
    fun frequencyCapAndMaximumImpressionsAreEnforced() {
        val now = 1_700_000_000_000L
        val snapshot = snapshot(
            properties = campaignProperties(maxImpressions = 2, frequencyCapHours = 24),
            assets = listOf(asset()),
        )
        val recent = StartupCampaignRecord("customer-1", "launch-2026", 1, now - 60 * 60 * 1_000L, false)
        assertNull(StartupCampaignPolicy.evaluate(snapshot, recent, now))

        val old = recent.copy(lastImpressionAtMillis = now - 25 * 60 * 60 * 1_000L)
        assertNotNull(
            StartupCampaignPolicy.evaluate(
                snapshot,
                old,
                now,
                resolveAssetPath = { "/cached/hero-image" },
            ),
        )
        assertNull(StartupCampaignPolicy.evaluate(snapshot, old.copy(impressions = 2), now))
        assertNull(StartupCampaignPolicy.evaluate(snapshot, old.copy(dismissed = true), now))
    }

    @Test
    fun manifestScopeStillEnforcesMarketLocaleVersionAndSchedule() {
        val now = 1_700_000_000_000L
        assertNull(StartupCampaignPolicy.evaluate(snapshot(scope = scope.copy(marketCode = "id-bdg")), nowMillis = now))
        assertNull(StartupCampaignPolicy.evaluate(snapshot(scope = scope.copy(locale = "en-US")), nowMillis = now))
        assertNull(StartupCampaignPolicy.evaluate(snapshot(scope = scope.copy(appVersion = "0.9.0")), nowMillis = now))
    }

    private fun campaignProperties(
        enabled: Boolean = true,
        maxImpressions: Int = 1,
        frequencyCapHours: Int = 24,
    ): JsonObject = buildJsonObject {
        put("enabled", enabled)
        put("campaign_id", "launch-2026")
        put("title", "Promo khusus untuk kamu")
        put("body", "Copy dari manifest yang sudah di-cache.")
        put("media_asset_id", "hero-image")
        put("frequency_cap_hours", frequencyCapHours)
        put("max_impressions", maxImpressions)
        put("dismissible", true)
        put("skippable", true)
    }

    private fun snapshot(
        scope: ExperienceConfigScope = this.scope,
        properties: JsonObject = campaignProperties(),
        assets: List<ExperienceAssetReference> = emptyList(),
        targeting: JsonObject = buildJsonObject {},
        startsAt: String = Instant.ofEpochMilli(1_699_999_000_000L).toString(),
        endsAt: String? = null,
    ) = ExperienceConfigSnapshot(
        manifest = ExperienceManifest(
            manifestId = "manifest-1",
            schemaVersion = 1,
            revision = 1,
            marketCode = scope.marketCode,
            locale = scope.locale,
            surface = scope.surface,
            minAppVersion = "1.0.0",
            startsAt = startsAt,
            endsAt = endsAt,
            ttlSeconds = 300,
            cachePolicy = "private",
            targeting = targeting,
            sections = listOf(ExperienceSection("intro", "campaign_intro", properties)),
            assetReferences = assets,
            checksum = "a".repeat(64),
        ),
        source = ExperienceConfigSource.NETWORK,
        loadedAtMillis = 1_699_999_000_000L,
        scope = scope,
        assetBundleKey = "manifest-1-1",
    )

    private fun asset() = ExperienceAssetReference(
        assetId = "hero-image",
        uri = "https://cdn.example.test/hero.webp",
        kind = "image",
        checksum = "b".repeat(64),
    )
}
