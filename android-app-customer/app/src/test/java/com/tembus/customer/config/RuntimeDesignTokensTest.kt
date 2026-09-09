package com.tembus.customer.config

import com.tembus.customer.data.config.model.ExperienceManifest
import com.tembus.customer.data.config.model.ExperienceSection
import com.tembus.customer.ui.theme.RuntimeAccentPreset
import com.tembus.customer.ui.theme.RuntimeBackgroundPreset
import com.tembus.customer.ui.theme.RuntimeBadgePreset
import com.tembus.customer.ui.theme.RuntimeCornerPreset
import com.tembus.customer.ui.theme.RuntimeDesignTokens
import com.tembus.customer.ui.theme.RuntimeSpacingPreset
import com.tembus.customer.ui.theme.resolveRuntimeDesignTokens
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RuntimeDesignTokensTest {
    @Test
    fun validPresetsMapToCompiledValuesAndKeepContrastSafe() {
        val tokens = RuntimeDesignTokens.fromManifest(
            manifest(
                buildJsonObject {
                    put("accent_preset", "campaign_blue")
                    put("background_preset", "brand_soft")
                    put("corner_preset", "emphasized")
                    put("spacing_preset", "relaxed")
                    put("badge_preset", "label")
                },
            ),
        )

        assertEquals(RuntimeAccentPreset.CAMPAIGN_BLUE, tokens.accentPreset)
        assertEquals(RuntimeBackgroundPreset.BRAND_SOFT, tokens.backgroundPreset)
        assertEquals(RuntimeCornerPreset.EMPHASIZED, tokens.cornerPreset)
        assertEquals(RuntimeSpacingPreset.RELAXED, tokens.spacingPreset)
        assertEquals(RuntimeBadgePreset.LABEL, tokens.badgePreset)
        assertEquals(24, tokens.cornerRadius.value.toInt())
        assertEquals(20, tokens.contentPadding.value.toInt())
        assertTrue(tokens.isContrastSafe(darkTheme = false))
        assertTrue(tokens.isContrastSafe(darkTheme = true))
    }

    @Test
    fun missingOrUnsupportedValuesFallbackIndividuallyToPackagedDefaults() {
        val tokens = RuntimeDesignTokens.fromManifest(
            manifest(
                buildJsonObject {
                    put("accent_preset", "#FF0000")
                    put("spacing_preset", "compact")
                    put("font_url", "https://evil.example/font.woff2")
                },
            ),
        )

        assertEquals(RuntimeAccentPreset.BRAND, tokens.accentPreset)
        assertEquals(RuntimeBackgroundPreset.SURFACE, tokens.backgroundPreset)
        assertEquals(RuntimeSpacingPreset.COMPACT, tokens.spacingPreset)
        assertEquals(RuntimeBadgePreset.PILL, tokens.badgePreset)
        assertTrue(tokens.isContrastSafe(darkTheme = false))
        assertTrue(tokens.isContrastSafe(darkTheme = true))
    }

    @Test
    fun disabledProviderAlwaysUsesPackagedDefaultsForCriticalScreens() {
        val resolved = resolveRuntimeDesignTokens(
            manifest(
                buildJsonObject {
                    put("accent_preset", "campaign_orange")
                    put("background_preset", "accent_soft")
                },
            ),
            enabled = false,
        )

        assertEquals(RuntimeDesignTokens.PackagedDefault, resolved)
        assertFalse(resolved.accentPreset == RuntimeAccentPreset.CAMPAIGN_ORANGE)
    }

    private fun manifest(properties: kotlinx.serialization.json.JsonObject) = ExperienceManifest(
        manifestId = "manifest-1",
        revision = 1,
        marketCode = "id-jk",
        locale = "id-ID",
        surface = "customer_android",
        sections = listOf(ExperienceSection("theme", "design_tokens", properties)),
    )
}
