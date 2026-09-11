package com.tembus.customer.data.config

import kotlin.math.abs

/**
 * TEMBUS media contract for remotely configured experience and campaign art.
 * Text is rendered by the app beside/over the asset only when the declared
 * safe zone supports it; creative never supplies executable UI chrome.
 */
data class TembusMediaPreset(
    val key: String,
    val aspectRatio: Double,
    val safeTextZone: String,
    val maxBytes: Long,
    val staticFallbackRequired: Boolean,
)

object TembusMediaGovernance {
    val HeroBanner = TembusMediaPreset("hero_banner", 16.0 / 9.0, "none", 5L * 1024L * 1024L, false)
    val MerchantCard = TembusMediaPreset("merchant_card", 4.0 / 3.0, "none", 2L * 1024L * 1024L, false)
    val SponsoredCard = TembusMediaPreset("sponsored_card", 4.0 / 3.0, "none", 2L * 1024L * 1024L, false)
    val CategoryTile = TembusMediaPreset("category_tile", 1.0, "none", 1L * 1024L * 1024L, false)
    val CampaignIntro = TembusMediaPreset("campaign_intro", 16.0 / 9.0, "none", 5L * 1024L * 1024L, true)
    val EmptyState = TembusMediaPreset("empty_state", 1.0, "none", 512L * 1024L, false)

    val presets: List<TembusMediaPreset> = listOf(
        HeroBanner,
        MerchantCard,
        SponsoredCard,
        CategoryTile,
        CampaignIntro,
        EmptyState,
    )

    private val safeTextZones = setOf("none", "left", "right", "top", "bottom", "center")

    fun presetForComponent(component: String): TembusMediaPreset? = when (component) {
        "hero_banner", "campaign_strip" -> HeroBanner
        "promo_carousel" -> SponsoredCard
        "campaign_intro" -> CampaignIntro
        "info_card" -> CategoryTile
        else -> null
    }

    fun acceptsAspectRatio(component: String, actual: Double?): Boolean {
        if (actual == null) return true
        if (!actual.isFinite() || actual <= 0.0) return false
        val preset = presetForComponent(component) ?: return true
        return abs(actual - preset.aspectRatio) <= 0.08
    }

    fun isValidSafeTextZone(value: String?): Boolean =
        value == null || value.trim().lowercase() in safeTextZones

    fun requiresStaticFallback(kind: String): Boolean = kind in setOf("animation", "video")

    fun isStaticFallbackKind(kind: String): Boolean = kind in setOf("image", "icon")

    fun fallbackIsCompatible(primaryKind: String, fallbackKind: String): Boolean = when {
        requiresStaticFallback(primaryKind) -> isStaticFallbackKind(fallbackKind)
        primaryKind in setOf("image", "animation", "icon") -> fallbackKind in setOf("image", "animation", "icon")
        else -> primaryKind == fallbackKind
    }
}
