package com.tembus.merchant.util

import android.os.Build
import android.util.Log
import com.tembus.merchant.BuildConfig
import java.util.Locale

/**
 * Safe local diagnostics for merchant builds. Remote crash collection stays
 * disabled until a vendor/project is configured; no user content is logged.
 */
object MobileCrashContext {
    private const val TAG = "MobileCrashContext"
    private const val DEFAULT_MARKET = "id-jk"

    fun install() {
        put("app_version", BuildConfig.VERSION_NAME)
        put("app_build", BuildConfig.VERSION_CODE.toString())
        put("device_os", Build.VERSION.SDK_INT.toString())
        put("device_model", "${Build.MANUFACTURER}-${Build.MODEL}")
        setMarketCode(DEFAULT_MARKET)
    }

    fun setScreen(screen: String) = put("screen", screen)

    fun setMarketCode(marketCode: String?) = put("market_code", marketCode ?: DEFAULT_MARKET)

    fun setFeatureFlagRevision(revision: Long) {
        if (revision > 0L) put("feature_flag_revision", revision.toString())
    }

    fun setExperienceRevision(revision: Int) {
        if (revision > 0) put("experience_manifest_revision", revision.toString())
    }

    private fun put(key: String, value: String) {
        normalize(value)
        Log.d(TAG, "context key updated: $key")
    }

    private fun normalize(value: String): String = value.trim().lowercase(Locale.ROOT)
        .replace(UNSAFE_VALUE, "_")
        .take(MAX_VALUE_LENGTH)
        .ifBlank { "unknown" }

    private const val MAX_VALUE_LENGTH = 96
    private val UNSAFE_VALUE = Regex("[^a-z0-9._:-]")
}
