package com.tembus.customer.ui.theme

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.runtime.remember
import com.tembus.customer.data.config.model.ExperienceConfigSnapshot
import com.tembus.customer.data.config.model.ExperienceManifest

/**
 * Applies remote campaign presentation tokens to a deliberately narrow
 * composition scope. It is not part of [TEMBUSCustomerTheme], so transaction
 * screens keep the packaged Material theme and can explicitly pass
 * [enabled] = false when they render shared campaign content.
 */
val LocalRuntimeDesignTokens = staticCompositionLocalOf { RuntimeDesignTokens.PackagedDefault }

internal fun resolveRuntimeDesignTokens(
    manifest: ExperienceManifest,
    enabled: Boolean,
): RuntimeDesignTokens = if (enabled) {
    RuntimeDesignTokens.fromManifest(manifest)
} else {
    RuntimeDesignTokens.PackagedDefault
}

@Composable
fun RuntimeThemeProvider(
    snapshot: ExperienceConfigSnapshot,
    enabled: Boolean = true,
    content: @Composable () -> Unit,
) {
    val tokens = remember(snapshot.manifest.manifestId, snapshot.manifest.revision, enabled) {
        resolveRuntimeDesignTokens(snapshot.manifest, enabled)
    }
    CompositionLocalProvider(LocalRuntimeDesignTokens provides tokens, content = content)
}
