package com.tembus.customer.domain.config

import com.tembus.customer.data.config.StartupCampaignRecord
import com.tembus.customer.data.config.model.ExperienceAssetReference
import com.tembus.customer.data.config.model.ExperienceConfigScope
import com.tembus.customer.data.config.model.ExperienceConfigSnapshot
import com.tembus.customer.data.config.model.ExperienceManifest
import com.tembus.customer.data.config.model.ExperienceManifestValidator
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

data class StartupCampaign(
    val campaignId: String,
    val enabled: Boolean,
    val title: String,
    val body: String?,
    val mediaAssetId: String?,
    val frequencyCapHours: Int,
    val maxImpressions: Int,
    val dismissible: Boolean,
    val skippable: Boolean,
    val assetReference: ExperienceAssetReference?,
)

data class StartupCampaignDecision(
    val campaign: StartupCampaign,
    /** A verified local path/asset URI; never a remote URL. */
    val assetPath: String?,
    val manifestId: String? = null,
    val manifestRevision: Int = 0,
    val marketCode: String = "id-jk",
)

/**
 * Evaluates campaign delivery entirely from a validated cached manifest and
 * local delivery state. It deliberately has no network or Android UI calls.
 */
object StartupCampaignPolicy {
    private const val DEFAULT_FREQUENCY_CAP_HOURS = 24
    private const val DEFAULT_MAX_IMPRESSIONS = 1

    fun evaluate(
        snapshot: ExperienceConfigSnapshot,
        record: StartupCampaignRecord? = null,
        nowMillis: Long = System.currentTimeMillis(),
        resolveAssetPath: (ExperienceAssetReference) -> String? = { null },
    ): StartupCampaignDecision? {
        val scope = snapshot.scope ?: return null
        val manifest = ExperienceManifestValidator.sanitize(snapshot.manifest, scope, nowMillis) ?: return null
        if (!targetingMatches(manifest, scope)) return null

        val campaign = parse(manifest) ?: return null
        if (!campaign.enabled) return null
        if (record != null && record.campaignId == campaign.campaignId) {
            if (record.dismissed) return null
            if (record.impressions >= campaign.maxImpressions) return null
            if (isFrequencyCapped(record.lastImpressionAtMillis, campaign.frequencyCapHours, nowMillis)) return null
        }

        val assetPath = campaign.assetReference?.let(resolveAssetPath)
            ?: if (campaign.mediaAssetId == null) null else return null
        return StartupCampaignDecision(
            campaign = campaign,
            assetPath = assetPath,
            manifestId = manifest.manifestId.takeIf { it.isNotBlank() && it != "packaged-default" },
            manifestRevision = manifest.revision.coerceAtLeast(0),
            marketCode = scope.marketCode,
        )
    }

    fun parse(manifest: ExperienceManifest): StartupCampaign? {
        val section = manifest.sections.firstOrNull { it.component == "campaign_intro" } ?: return null
        val properties = section.properties
        val campaignId = properties.string("campaign_id") ?: return null
        val title = properties.string("title") ?: return null
        val mediaAssetId = properties.string("media_asset_id")
        val assetReference = mediaAssetId?.let { id ->
            manifest.assetReferences.firstOrNull { it.assetId == id }
        }
        if (mediaAssetId != null && assetReference == null) return null
        if (assetReference != null && assetReference.kind !in setOf("image", "animation")) return null

        return StartupCampaign(
            campaignId = campaignId,
            enabled = properties.boolean("enabled", default = true),
            title = title,
            body = properties.string("body"),
            mediaAssetId = mediaAssetId,
            frequencyCapHours = properties.int("frequency_cap_hours", DEFAULT_FREQUENCY_CAP_HOURS)
                .coerceIn(0, 720),
            maxImpressions = properties.int("max_impressions", DEFAULT_MAX_IMPRESSIONS)
                .coerceIn(1, 100),
            dismissible = properties.boolean("dismissible", default = true),
            skippable = properties.boolean("skippable", default = true),
            assetReference = assetReference,
        )
    }

    /** The server resolves these fields before the manifest reaches the app. */
    fun targetingMatches(manifest: ExperienceManifest, scope: ExperienceConfigScope): Boolean {
        val targeting = manifest.targeting
        val cohorts = targeting["cohorts"] as? JsonArray
        if (cohorts != null) {
            val values = cohorts.mapNotNull { (it as? JsonPrimitive)?.contentOrNull?.trim() }
            if (values.size != cohorts.size) return false
            if (values.isNotEmpty() && scope.cohort !in values) return false
        }
        val experiment = (targeting["experiment_ref"] as? JsonPrimitive)?.contentOrNull?.trim()
        if (!experiment.isNullOrBlank() && experiment != scope.experimentRef) return false
        return true
    }

    fun isFrequencyCapped(lastImpressionAtMillis: Long, capHours: Int, nowMillis: Long): Boolean {
        if (lastImpressionAtMillis <= 0L || capHours <= 0) return false
        val capMillis = capHours.toLong() * 60L * 60L * 1_000L
        return nowMillis - lastImpressionAtMillis < capMillis
    }

    private fun JsonObject.string(key: String): String? =
        (this[key] as? JsonPrimitive)?.contentOrNull?.trim()?.takeIf { it.isNotEmpty() }

    private fun JsonObject.boolean(key: String, default: Boolean): Boolean =
        (this[key] as? JsonPrimitive)?.contentOrNull?.toBooleanStrictOrNull() ?: default

    private fun JsonObject.int(key: String, default: Int): Int =
        (this[key] as? JsonPrimitive)?.contentOrNull?.toIntOrNull() ?: default
}
