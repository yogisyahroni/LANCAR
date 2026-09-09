package com.tembus.customer.data.config.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import java.util.Locale

@Serializable
data class ExperienceManifestEnvelope(
    @SerialName("success") val success: Boolean = false,
    @SerialName("data") val data: ExperienceManifest? = null,
    @SerialName("message") val message: String? = null,
    @SerialName("code") val code: String? = null,
)

@Serializable
data class ExperienceManifest(
    @SerialName("manifest_id") val manifestId: String = "",
    @SerialName("schema_version") val schemaVersion: Int = 0,
    @SerialName("revision") val revision: Int = 0,
    @SerialName("market_code") val marketCode: String = "",
    @SerialName("locale") val locale: String = "",
    @SerialName("resolved_locale") val resolvedLocale: String? = null,
    @SerialName("surface") val surface: String = "",
    @SerialName("min_app_version") val minAppVersion: String = "0.0.0",
    @SerialName("max_app_version") val maxAppVersion: String? = null,
    @SerialName("starts_at") val startsAt: String = "1970-01-01T00:00:00.000Z",
    @SerialName("ends_at") val endsAt: String? = null,
    @SerialName("ttl_seconds") val ttlSeconds: Int = 0,
    @SerialName("cache_policy") val cachePolicy: String = "private",
    @SerialName("targeting") val targeting: JsonObject = buildJsonObject {},
    @SerialName("sections") val sections: List<ExperienceSection> = emptyList(),
    @SerialName("asset_references") val assetReferences: List<ExperienceAssetReference> = emptyList(),
    @SerialName("checksum") val checksum: String = "",
    @SerialName("signature") val signature: String? = null,
    @SerialName("published_at") val publishedAt: String? = null,
    @SerialName("published_by") val publishedBy: String? = null,
)

@Serializable
data class ExperienceSection(
    @SerialName("id") val id: String = "",
    @SerialName("component") val component: String = "",
    @SerialName("properties") val properties: JsonObject = buildJsonObject {},
)

@Serializable
data class ExperienceAssetReference(
    @SerialName("asset_id") val assetId: String = "",
    @SerialName("uri") val uri: String = "",
    @SerialName("kind") val kind: String = "",
    @SerialName("checksum") val checksum: String = "",
)

data class ExperienceConfigScope(
    val marketCode: String,
    val locale: String,
    val appVersion: String,
    val surface: String = CUSTOMER_ANDROID_SURFACE,
    val cohort: String? = null,
    val experimentRef: String? = null,
) {
    val cacheKey: String
        // Cohort/experiment are part of the resolved-manifest identity. A
        // single cached revision must never be reused for another audience
        // after an account switch.
        get() = listOf(
            marketCode,
            locale,
            appVersion,
            surface,
            cohort.orEmpty(),
            experimentRef.orEmpty(),
        ).joinToString("|")
}

enum class ExperienceConfigSource {
    PACKAGED_DEFAULT,
    LAST_KNOWN_GOOD,
    NETWORK,
}

data class ExperienceConfigSnapshot(
    val manifest: ExperienceManifest,
    val source: ExperienceConfigSource,
    val loadedAtMillis: Long,
    val scope: ExperienceConfigScope? = null,
    val assetBundleKey: String? = null,
)

object ExperienceManifestValidator {
    const val SUPPORTED_SCHEMA_VERSION = 1
    const val CUSTOMER_ANDROID_SURFACE = "customer_android"
    const val DEFAULT_MARKET_CODE = "id-jk"

    private val identifier = Regex("^[a-z0-9][a-z0-9._-]{0,127}$")
    private val semver = Regex("^\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?(?:\\+[0-9A-Za-z.-]+)?$")
    private val sha256 = Regex("^[a-f0-9]{64}$")
    private val components = mapOf(
        "hero_banner" to setOf("title", "body", "image_asset_id", "cta_label", "deep_link"),
        "campaign_strip" to setOf("title", "body", "cta_label", "deep_link"),
        "promo_carousel" to setOf("items"),
        "service_grid" to setOf("title", "service_codes", "cards", "display_mode"),
        "info_card" to setOf("title", "body", "icon_asset_id", "deep_link"),
        "quick_actions" to setOf("actions"),
        "notice" to setOf("title", "body", "cta_label", "deep_link"),
        "spacer" to setOf("size"),
        "campaign_intro" to setOf(
            "enabled", "campaign_id", "title", "body", "media_asset_id",
            "frequency_cap_hours", "max_impressions", "dismissible", "skippable",
        ),
    )
    private val protectedKeys = setOf(
        "amount", "authorization", "commission", "currency", "delivery_status",
        "eligibility", "financial", "order_state", "payment", "payout", "price",
        "provider", "refund", "risk", "settlement", "state_machine", "tax",
        "total", "transaction",
    )

    fun sanitize(
        manifest: ExperienceManifest,
        scope: ExperienceConfigScope,
        nowMillis: Long = System.currentTimeMillis(),
    ): ExperienceManifest? {
        if (manifest.schemaVersion != SUPPORTED_SCHEMA_VERSION) return null
        if (manifest.marketCode.trim().lowercase(Locale.ROOT) != scope.marketCode.lowercase(Locale.ROOT)) return null
        if (manifest.surface != scope.surface) return null
        if (!localeMatches(manifest.locale, scope.locale)) return null
        if (!isWithinVersion(manifest.minAppVersion, manifest.maxAppVersion, scope.appVersion)) return null
        if (!isInSchedule(manifest.startsAt, manifest.endsAt, nowMillis)) return null
        if (manifest.manifestId.isBlank() || manifest.revision < 1 || !sha256.matches(manifest.checksum)) return null

        val assets = manifest.assetReferences.mapNotNull(::sanitizeAsset)
        if (assets.size != manifest.assetReferences.size) return null
        val assetIds = assets.map { it.assetId }.toSet()
        if (assetIds.size != assets.size) return null

        val sections = manifest.sections.mapNotNull { section ->
            sanitizeSection(section, assetIds)
        }
        // A non-empty server manifest with no supported content is not safe to cache.
        // The caller keeps the previous known-good revision or packaged defaults.
        if (manifest.sections.isNotEmpty() && sections.isEmpty()) return null

        return manifest.copy(
            marketCode = manifest.marketCode.trim().lowercase(Locale.ROOT),
            locale = normalizeLocale(manifest.locale),
            resolvedLocale = manifest.resolvedLocale?.let(::normalizeLocale),
            surface = scope.surface,
            ttlSeconds = manifest.ttlSeconds.coerceIn(0, 86_400),
            cachePolicy = manifest.cachePolicy.takeIf { it in setOf("no-store", "private", "public") } ?: "private",
            sections = sections,
            assetReferences = assets,
        )
    }

    fun packagedDefault(scope: ExperienceConfigScope): ExperienceManifest = ExperienceManifest(
        manifestId = "packaged-default",
        schemaVersion = SUPPORTED_SCHEMA_VERSION,
        revision = 0,
        marketCode = scope.marketCode,
        locale = scope.locale,
        resolvedLocale = scope.locale,
        surface = scope.surface,
        minAppVersion = "0.0.0",
        ttlSeconds = 0,
        cachePolicy = "no-store",
        sections = emptyList(),
        assetReferences = emptyList(),
        checksum = "0".repeat(64),
    )

    fun compareVersions(left: String, right: String): Int {
        val a = parseVersion(left) ?: return -1
        val b = parseVersion(right) ?: return 1
        for (index in 0..2) {
            if (a[index] != b[index]) return a[index].compareTo(b[index])
        }
        return 0
    }

    private fun sanitizeAsset(asset: ExperienceAssetReference): ExperienceAssetReference? {
        if (!identifier.matches(asset.assetId) || !sha256.matches(asset.checksum)) return null
        if (asset.kind !in setOf("image", "animation", "icon", "video")) return null
        val uri = asset.uri.trim()
        val isLocalAsset = uri.startsWith("/assets/") && !uri.contains("..") && !uri.contains("//")
        // URI userInfo must be absent; keep this explicit to avoid credentials in asset URLs.
        val httpsWithoutCredentials = runCatching {
            val parsed = java.net.URI(uri)
            parsed.scheme.equals("https", ignoreCase = true) && parsed.userInfo == null && parsed.host != null
        }.getOrDefault(false)
        if (!isLocalAsset && !httpsWithoutCredentials) return null
        return asset.copy(assetId = asset.assetId.lowercase(Locale.ROOT), uri = uri)
    }

    private fun sanitizeSection(section: ExperienceSection, assetIds: Set<String>): ExperienceSection? {
        val id = section.id.trim().lowercase(Locale.ROOT)
        val component = section.component.trim().lowercase(Locale.ROOT)
        if (!identifier.matches(id)) return null
        val allowed = components[component] ?: return null
        val properties = sanitizeProperties(component, section.properties, allowed) ?: return null
        val referencedAssetIds = collectAssetIds(properties)
        if (referencedAssetIds.any { it !in assetIds }) return null
        return section.copy(id = id, component = component, properties = properties)
    }

    private fun sanitizeProperties(component: String, input: JsonObject, allowed: Set<String>): JsonObject? {
        val result = linkedMapOf<String, JsonElement>()
        for ((key, value) in input) {
            val normalizedKey = key.lowercase(Locale.ROOT)
            if (normalizedKey !in allowed || normalizedKey in protectedKeys) continue
            val sanitized = when {
                normalizedKey == "items" && component == "promo_carousel" -> sanitizePromoItems(value)
                normalizedKey == "actions" && component == "quick_actions" -> sanitizeQuickActions(value)
                normalizedKey == "cards" && component == "service_grid" -> sanitizeServiceCards(value)
                normalizedKey == "service_codes" -> sanitizeIdentifiers(value)
                normalizedKey.endsWith("asset_id") -> sanitizeIdentifier(value)
                normalizedKey == "deep_link" -> sanitizeDeepLink(value)
                normalizedKey == "display_mode" -> (value as? JsonPrimitive)?.contentOrNull?.takeIf { it in setOf("compact", "cards") }?.let(::JsonPrimitive)
                normalizedKey == "size" && component == "spacer" -> (value as? JsonPrimitive)?.contentOrNull?.takeIf { it in setOf("small", "medium", "large") }?.let(::JsonPrimitive)
                normalizedKey == "code" && component == "service_card" -> sanitizeIdentifier(value)
                normalizedKey == "campaign_id" -> sanitizeIdentifier(value)
                normalizedKey in setOf("enabled", "dismissible", "skippable") -> sanitizeBoolean(value)
                normalizedKey in setOf("frequency_cap_hours", "max_impressions") -> sanitizeInteger(value, normalizedKey)
                else -> sanitizeText(value)
            }
            if (sanitized != null) result[normalizedKey] = sanitized
        }

        val required = when (component) {
            "hero_banner", "campaign_strip", "info_card" -> setOf("title")
            "promo_carousel", "quick_actions" -> setOf(if (component == "promo_carousel") "items" else "actions")
            "notice" -> setOf("title")
            "campaign_intro" -> setOf("campaign_id", "title")
            else -> emptySet()
        }
        if (!required.all(result::containsKey)) return null
        if (component == "service_grid" && "service_codes" !in result && "cards" !in result) return null
        return JsonObject(result)
    }

    private fun sanitizeServiceCards(value: JsonElement): JsonArray? {
        val cards = value as? JsonArray ?: return null
        val output = cards.mapNotNull { item ->
            val objectValue = item as? JsonObject ?: return@mapNotNull null
            sanitizeProperties("service_card", objectValue, setOf("code", "subtitle", "badge"))
                ?.takeIf { it.containsKey("code") }
        }
        return JsonArray(output).takeIf { output.size == cards.size && output.isNotEmpty() && output.size <= 20 }
    }

    private fun sanitizeBoolean(value: JsonElement): JsonPrimitive? =
        (value as? JsonPrimitive)?.contentOrNull?.toBooleanStrictOrNull()?.let(::JsonPrimitive)

    private fun sanitizeInteger(value: JsonElement, key: String): JsonPrimitive? {
        val parsed = (value as? JsonPrimitive)?.contentOrNull?.toIntOrNull() ?: return null
        val valid = when (key) {
            "frequency_cap_hours" -> parsed in 0..720
            "max_impressions" -> parsed in 1..100
            else -> false
        }
        return parsed.takeIf { valid }?.let(::JsonPrimitive)
    }

    private fun sanitizePromoItems(value: JsonElement): JsonArray? {
        val items = value as? JsonArray ?: return null
        val output = items.mapNotNull { item ->
            val objectValue = item as? JsonObject ?: return@mapNotNull null
            sanitizeProperties("promo_item", objectValue, setOf("id", "title", "body", "image_asset_id", "cta_label", "deep_link"))
                ?.takeIf { it.containsKey("id") && it.containsKey("title") }
        }
        return JsonArray(output).takeIf { output.size == items.size && output.isNotEmpty() && output.size <= 10 }
    }

    private fun sanitizeQuickActions(value: JsonElement): JsonArray? {
        val actions = value as? JsonArray ?: return null
        val output = actions.mapNotNull { item ->
            val objectValue = item as? JsonObject ?: return@mapNotNull null
            sanitizeProperties("quick_action", objectValue, setOf("id", "label", "icon_asset_id", "deep_link"))
                ?.takeIf { it.containsKey("id") && it.containsKey("label") && it.containsKey("deep_link") }
        }
        return JsonArray(output).takeIf { output.size == actions.size && output.isNotEmpty() && output.size <= 8 }
    }

    private fun sanitizeIdentifiers(value: JsonElement): JsonArray? {
        val values = value as? JsonArray ?: return null
        val identifiers = values.mapNotNull { (it as? JsonPrimitive)?.contentOrNull?.takeIf(identifier::matches) }
        return JsonArray(identifiers.map(::JsonPrimitive)).takeIf { identifiers.size == values.size && identifiers.isNotEmpty() && identifiers.size <= 20 }
    }

    private fun sanitizeIdentifier(value: JsonElement): JsonPrimitive? =
        (value as? JsonPrimitive)?.contentOrNull?.trim()?.lowercase(Locale.ROOT)?.takeIf(identifier::matches)?.let(::JsonPrimitive)

    private fun sanitizeDeepLink(value: JsonElement): JsonPrimitive? {
        val link = (value as? JsonPrimitive)?.contentOrNull?.trim() ?: return null
        val allowed = if (link.startsWith("lancar://")) {
            Regex("^lancar://(home|food|promo|orders|support|profile)(?:[/?#].*)?$").matches(link)
        } else {
            Regex("^/(home|food|promo|orders|support|profile)(?:[/?#].*)?$").matches(link)
        }
        return link.takeIf { allowed && it.length <= 512 && !it.contains("javascript:", ignoreCase = true) }?.let(::JsonPrimitive)
    }

    private fun sanitizeText(value: JsonElement): JsonPrimitive? {
        val text = (value as? JsonPrimitive)?.contentOrNull?.trim() ?: return null
        return text.takeIf { it.isNotEmpty() && it.length <= 700 && !Regex("[<>]|javascript:|data:text/html", RegexOption.IGNORE_CASE).containsMatchIn(it) }?.let(::JsonPrimitive)
    }

    private fun collectAssetIds(value: JsonElement): Set<String> {
        val found = linkedSetOf<String>()
        fun collect(element: JsonElement) {
            when (element) {
                is JsonArray -> element.forEach(::collect)
                is JsonObject -> element.forEach { (key, nested) ->
                    if (key.endsWith("asset_id")) (nested as? JsonPrimitive)?.contentOrNull?.let(found::add)
                    collect(nested)
                }
                else -> Unit
            }
        }
        collect(value)
        return found
    }

    private fun localeMatches(actual: String, requested: String): Boolean =
        normalizeLocale(actual).equals(normalizeLocale(requested), ignoreCase = true)

    private fun normalizeLocale(value: String): String = value.split('-').mapIndexed { index, part ->
        if (index == 0) part.lowercase(Locale.ROOT)
        else if (part.length == 2) part.uppercase(Locale.ROOT) else part.lowercase(Locale.ROOT)
    }.joinToString("-")

    private fun isWithinVersion(min: String, max: String?, current: String): Boolean {
        if (!semver.matches(min) || !semver.matches(current)) return false
        if (compareVersions(current, min) < 0) return false
        return max == null || (semver.matches(max) && compareVersions(current, max) <= 0)
    }

    private fun isInSchedule(startsAt: String, endsAt: String?, nowMillis: Long): Boolean {
        val starts = runCatching { java.time.Instant.parse(startsAt).toEpochMilli() }.getOrNull() ?: return false
        val ends = endsAt?.let { runCatching { java.time.Instant.parse(it).toEpochMilli() }.getOrNull() }
        return starts <= nowMillis && (ends == null || nowMillis < ends)
    }

    private fun parseVersion(value: String): List<Int>? {
        if (!semver.matches(value)) return null
        return value.substringBefore('-').substringBefore('+').split('.').mapNotNull { it.toIntOrNull() }.takeIf { it.size == 3 }
    }
}

private const val CUSTOMER_ANDROID_SURFACE = ExperienceManifestValidator.CUSTOMER_ANDROID_SURFACE
