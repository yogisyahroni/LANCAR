package com.tembus.courier.data.repository

import android.content.Context
import com.tembus.courier.BuildConfig
import com.tembus.courier.data.api.TEMBUSApiService
import com.tembus.courier.data.model.ExperienceManifest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.util.Locale

/** Presentation-only courier config; active-job truth remains in OrderViewModel. */
class ExperienceConfigRepository(
    context: Context,
    private val api: TEMBUSApiService,
) {
    private val preferences = context.applicationContext.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
    private val json = Json { ignoreUnknownKeys = true }

    suspend fun load(): ExperienceManifest? = withContext(Dispatchers.IO) {
        val networkManifest = runCatching {
            api.getExperienceManifest(
                marketCode = DEFAULT_MARKET,
                locale = Locale.getDefault().toLanguageTag().ifBlank { DEFAULT_LOCALE },
                surface = SURFACE,
                appVersion = BuildConfig.VERSION_NAME,
            )
        }.getOrNull()
            ?.takeIf { it.isSuccessful }
            ?.body()
            ?.data
            ?.takeIf(::isUsable)

        if (networkManifest != null) {
            preferences.edit().putString(KEY_MANIFEST, json.encodeToString(networkManifest)).apply()
            networkManifest
        } else {
            preferences.getString(KEY_MANIFEST, null)
                ?.let { runCatching { json.decodeFromString<ExperienceManifest>(it) }.getOrNull() }
                ?.takeIf(::isUsable)
        }
    }

    private fun isUsable(manifest: ExperienceManifest): Boolean =
        manifest.manifestId.isNotBlank()
            && manifest.revision > 0
            && manifest.surface == SURFACE
            && manifest.sections.all { it.component in ALLOWED_COMPONENTS }

    companion object {
        const val SURFACE = "courier_android"
        private const val DEFAULT_MARKET = "id-jk"
        private const val DEFAULT_LOCALE = "id-ID"
        private const val PREFERENCES = "courier_experience_config"
        private const val KEY_MANIFEST = "last_known_good_manifest"
        private val ALLOWED_COMPONENTS = setOf("campaign_strip", "info_card", "quick_actions", "notice", "spacer", "design_tokens")
    }
}
