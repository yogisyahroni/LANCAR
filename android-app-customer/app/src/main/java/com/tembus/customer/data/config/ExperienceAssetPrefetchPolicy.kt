package com.tembus.customer.data.config

import com.tembus.customer.data.config.model.ExperienceAssetReference
import com.tembus.customer.data.config.model.ExperienceManifest
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import java.time.Instant

/**
 * Selects only assets used by a near-term manifest. The public resolver returns
 * one audience-scoped manifest, so this policy is also the guard against
 * accidentally downloading an entire campaign/catalog asset registry.
 */
object ExperienceAssetPrefetchPolicy {
    const val PREFETCH_WINDOW_MILLIS = 24L * 60L * 60L * 1000L

    fun eligibleAssets(
        manifest: ExperienceManifest,
        nowMillis: Long = System.currentTimeMillis(),
        windowMillis: Long = PREFETCH_WINDOW_MILLIS,
    ): List<ExperienceAssetReference> {
        val startsAt = parseInstant(manifest.startsAt) ?: return emptyList()
        val endsAt = manifest.endsAt?.let(::parseInstant)
        val campaignWindowMillis = campaignPrefetchWindowMillis(manifest)
        val effectiveWindowMillis = minOf(windowMillis, campaignWindowMillis)
        if (startsAt > nowMillis + effectiveWindowMillis || endsAt != null && endsAt <= nowMillis) return emptyList()

        val referencedIds = manifest.sections.flatMapTo(linkedSetOf()) { collectAssetIds(it.properties) }
        val eligible = manifest.assetReferences.filter { asset ->
            asset.assetId in referencedIds && asset.kind in PREFETCHABLE_KINDS
        }
        val fallbackIds = eligible.mapNotNull { it.fallbackAssetId }.toSet()
        return manifest.assetReferences.filter { asset ->
            asset in eligible || asset.assetId in fallbackIds
        }
    }

    fun shouldPreferFallback(isMetered: Boolean, dataSaverEnabled: Boolean): Boolean = isMetered || dataSaverEnabled

    private fun campaignPrefetchWindowMillis(manifest: ExperienceManifest): Long {
        val configuredHours = manifest.sections
            .firstOrNull { it.component == "campaign_intro" }
            ?.properties
            ?.get("prefetch_window_hours")
            ?.let { (it as? JsonPrimitive)?.contentOrNull?.toLongOrNull() }
            ?.coerceIn(1L, 24L)
            ?: 24L
        return configuredHours * 60L * 60L * 1_000L
    }

    private fun collectAssetIds(element: JsonElement): Set<String> {
        val found = linkedSetOf<String>()
        fun visit(value: JsonElement) {
            when (value) {
                is JsonArray -> value.forEach(::visit)
                is JsonObject -> value.forEach { (key, nested) ->
                    if (key.endsWith("asset_id")) (nested as? JsonPrimitive)?.contentOrNull?.let(found::add)
                    visit(nested)
                }
                else -> Unit
            }
        }
        visit(element)
        return found
    }

    private fun parseInstant(value: String): Long? = runCatching { Instant.parse(value).toEpochMilli() }.getOrNull()

    private val PREFETCHABLE_KINDS = setOf("image", "animation", "icon", "video")
}
