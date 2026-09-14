package com.tembus.customer.util

import android.content.Context
import android.os.Build
import android.util.Log
import com.google.firebase.crashlytics.FirebaseCrashlytics
import com.tembus.customer.BuildConfig
import java.util.Locale

/**
 * Keeps crash diagnostics useful without placing customer content or
 * identifiers in Crashlytics keys. All values are bounded build/device or
 * server-controlled revision metadata.
 */
object MobileCrashContext {
    private const val TAG = "MobileCrashContext"
    private const val DEFAULT_MARKET = "id-jk"

    @Volatile
    private var crashlytics: FirebaseCrashlytics? = null

    fun install(context: Context) {
        crashlytics = runCatching {
            if (FirebaseInitializer.isInitialized(context)) FirebaseCrashlytics.getInstance() else null
        }.getOrNull()
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
        val safeValue = value.trim().lowercase(Locale.ROOT)
            .replace(UNSAFE_VALUE, "_")
            .take(MAX_VALUE_LENGTH)
            .ifBlank { "unknown" }
        runCatching { crashlytics?.setCustomKey(key, safeValue) }
        Log.d(TAG, "context key updated: $key")
    }

    private const val MAX_VALUE_LENGTH = 96
    private val UNSAFE_VALUE = Regex("[^a-z0-9._:-]")
}
