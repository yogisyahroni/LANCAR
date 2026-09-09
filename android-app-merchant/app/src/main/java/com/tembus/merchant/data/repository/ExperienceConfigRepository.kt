package com.tembus.merchant.data.repository

import android.content.Context
import com.google.gson.Gson
import com.tembus.merchant.BuildConfig
import com.tembus.merchant.data.api.TEMBUSApiService
import com.tembus.merchant.data.model.ExperienceManifest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.Locale

/** Presentation-only merchant config; it never owns order or kitchen state. */
class ExperienceConfigRepository(
    context: Context,
    private val api: TEMBUSApiService,
) {
    private val preferences = context.applicationContext.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
    private val gson = Gson()

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
            preferences.edit().putString(KEY_MANIFEST, gson.toJson(networkManifest)).apply()
            networkManifest
        } else {
            preferences.getString(KEY_MANIFEST, null)
                ?.let { runCatching { gson.fromJson(it, ExperienceManifest::class.java) }.getOrNull() }
                ?.takeIf(::isUsable)
        }
    }

    private fun isUsable(manifest: ExperienceManifest): Boolean =
        manifest.manifestId.isNotBlank()
            && manifest.revision > 0
            && manifest.surface == SURFACE
            && manifest.sections.all { it.component in ALLOWED_COMPONENTS }

    companion object {
        const val SURFACE = "merchant_android"
        private const val DEFAULT_MARKET = "id-jk"
        private const val DEFAULT_LOCALE = "id-ID"
        private const val PREFERENCES = "merchant_experience_config"
        private const val KEY_MANIFEST = "last_known_good_manifest"
        private val ALLOWED_COMPONENTS = setOf("campaign_strip", "info_card", "quick_actions", "notice", "spacer", "design_tokens")
    }
}
