package com.tembus.customer.ui.theme

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.tembus.customer.data.config.model.ExperienceManifest
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlin.math.pow

/**
 * Compiled, semantic campaign presentation presets. Remote manifests can only
 * select these values; they cannot provide colors, fonts, layout code, or
 * executable UI instructions.
 */
enum class RuntimeAccentPreset {
    BRAND,
    CAMPAIGN_ORANGE,
    CAMPAIGN_BLUE,
    ;

    companion object {
        fun fromWire(value: String?): RuntimeAccentPreset = when (value?.trim()?.lowercase()) {
            "campaign_orange" -> CAMPAIGN_ORANGE
            "campaign_blue" -> CAMPAIGN_BLUE
            else -> BRAND
        }
    }
}

enum class RuntimeBackgroundPreset {
    SURFACE,
    BRAND_SOFT,
    ACCENT_SOFT,
    ;

    companion object {
        fun fromWire(value: String?): RuntimeBackgroundPreset = when (value?.trim()?.lowercase()) {
            "brand_soft" -> BRAND_SOFT
            "accent_soft" -> ACCENT_SOFT
            else -> SURFACE
        }
    }
}

enum class RuntimeCornerPreset {
    COMPACT,
    STANDARD,
    EMPHASIZED,
    ;

    companion object {
        fun fromWire(value: String?): RuntimeCornerPreset = when (value?.trim()?.lowercase()) {
            "compact" -> COMPACT
            "emphasized" -> EMPHASIZED
            else -> STANDARD
        }
    }
}

enum class RuntimeSpacingPreset {
    COMPACT,
    STANDARD,
    RELAXED,
    ;

    companion object {
        fun fromWire(value: String?): RuntimeSpacingPreset = when (value?.trim()?.lowercase()) {
            "compact" -> COMPACT
            "relaxed" -> RELAXED
            else -> STANDARD
        }
    }
}

enum class RuntimeBadgePreset {
    HIDDEN,
    LABEL,
    PILL,
    ;

    companion object {
        fun fromWire(value: String?): RuntimeBadgePreset = when (value?.trim()?.lowercase()) {
            "hidden" -> HIDDEN
            "label" -> LABEL
            else -> PILL
        }
    }
}

data class RuntimeDesignTokens(
    val accentPreset: RuntimeAccentPreset = RuntimeAccentPreset.BRAND,
    val backgroundPreset: RuntimeBackgroundPreset = RuntimeBackgroundPreset.SURFACE,
    val cornerPreset: RuntimeCornerPreset = RuntimeCornerPreset.STANDARD,
    val spacingPreset: RuntimeSpacingPreset = RuntimeSpacingPreset.STANDARD,
    val badgePreset: RuntimeBadgePreset = RuntimeBadgePreset.PILL,
) {
    val cornerRadius: Dp
        get() = when (cornerPreset) {
            RuntimeCornerPreset.COMPACT -> 12.dp
            RuntimeCornerPreset.STANDARD -> 18.dp
            RuntimeCornerPreset.EMPHASIZED -> 24.dp
        }

    val innerCornerRadius: Dp
        get() = when (cornerPreset) {
            RuntimeCornerPreset.COMPACT -> 8.dp
            RuntimeCornerPreset.STANDARD -> 12.dp
            RuntimeCornerPreset.EMPHASIZED -> 16.dp
        }

    val contentPadding: Dp
        get() = when (spacingPreset) {
            RuntimeSpacingPreset.COMPACT -> 12.dp
            RuntimeSpacingPreset.STANDARD -> 16.dp
            RuntimeSpacingPreset.RELAXED -> 20.dp
        }

    val itemSpacing: Dp
        get() = when (spacingPreset) {
            RuntimeSpacingPreset.COMPACT -> 8.dp
            RuntimeSpacingPreset.STANDARD -> 12.dp
            RuntimeSpacingPreset.RELAXED -> 16.dp
        }

    fun accentColor(darkTheme: Boolean): Color = when (accentPreset) {
        RuntimeAccentPreset.BRAND -> if (darkTheme) DarkPrimary else Primary
        RuntimeAccentPreset.CAMPAIGN_ORANGE -> if (darkTheme) DarkAccent else Accent
        RuntimeAccentPreset.CAMPAIGN_BLUE -> if (darkTheme) DarkInfo else Info
    }

    fun accentContentColor(darkTheme: Boolean): Color = when (accentPreset) {
        RuntimeAccentPreset.BRAND -> if (darkTheme) DarkOnSurface else OnPrimary
        RuntimeAccentPreset.CAMPAIGN_ORANGE -> if (darkTheme) DarkBackground else OnAccent
        RuntimeAccentPreset.CAMPAIGN_BLUE -> if (darkTheme) DarkBackground else OnPrimary
    }

    fun backgroundColor(darkTheme: Boolean): Color = when (backgroundPreset) {
        RuntimeBackgroundPreset.SURFACE -> if (darkTheme) DarkSurface else Surface
        RuntimeBackgroundPreset.BRAND_SOFT -> if (darkTheme) DarkPrimarySoft else PrimarySoft
        RuntimeBackgroundPreset.ACCENT_SOFT -> if (darkTheme) DarkAccentSoft else AccentSoft
    }

    /**
     * Every preset is backed by a fixed palette pair. Keep this guard close to
     * the client mapping so a future preset cannot silently ship low contrast.
     */
    fun isContrastSafe(darkTheme: Boolean): Boolean {
        val foreground = accentContentColor(darkTheme)
        val accent = accentColor(darkTheme)
        val background = backgroundColor(darkTheme)
        val text = if (darkTheme) DarkOnSurface else OnSurface
        return contrastRatio(foreground, accent) >= MIN_TEXT_CONTRAST &&
            contrastRatio(text, background) >= MIN_TEXT_CONTRAST
    }

    companion object {
        val PackagedDefault = RuntimeDesignTokens()

        fun fromManifest(manifest: ExperienceManifest): RuntimeDesignTokens {
            val section = manifest.sections.firstOrNull { it.component == "design_tokens" }
                ?: return PackagedDefault
            val properties = section.properties
            val tokens = RuntimeDesignTokens(
                accentPreset = RuntimeAccentPreset.fromWire(properties.stringValue("accent_preset")),
                backgroundPreset = RuntimeBackgroundPreset.fromWire(properties.stringValue("background_preset")),
                cornerPreset = RuntimeCornerPreset.fromWire(properties.stringValue("corner_preset")),
                spacingPreset = RuntimeSpacingPreset.fromWire(properties.stringValue("spacing_preset")),
                badgePreset = RuntimeBadgePreset.fromWire(properties.stringValue("badge_preset")),
            )
            return tokens.takeIf { it.isContrastSafe(false) && it.isContrastSafe(true) } ?: PackagedDefault
        }
    }
}

private const val MIN_TEXT_CONTRAST = 4.5

private fun kotlinx.serialization.json.JsonObject.stringValue(key: String): String? =
    (this[key] as? JsonPrimitive)?.contentOrNull

private fun contrastRatio(foreground: Color, background: Color): Double {
    val foregroundLuminance = relativeLuminance(foreground)
    val backgroundLuminance = relativeLuminance(background)
    val lighter = maxOf(foregroundLuminance, backgroundLuminance)
    val darker = minOf(foregroundLuminance, backgroundLuminance)
    return (lighter + 0.05) / (darker + 0.05)
}

private fun relativeLuminance(color: Color): Double {
    fun linear(channel: Float): Double {
        val value = channel.toDouble()
        return if (value <= 0.03928) value / 12.92 else ((value + 0.055) / 1.055).pow(2.4)
    }
    return (0.2126 * linear(color.red)) +
        (0.7152 * linear(color.green)) +
        (0.0722 * linear(color.blue))
}
