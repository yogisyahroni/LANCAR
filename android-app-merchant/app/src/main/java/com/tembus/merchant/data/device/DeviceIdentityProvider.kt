package com.tembus.merchant.data.device

import android.content.Context
import android.provider.Settings
import java.util.UUID

/**
 * DeviceIdentityProvider — identitas device untuk auth (LGN-05 backend: device_id wajib).
 * Pola sama dengan customer app: "android:<ANDROID_ID>" dengan fallback UUID persisten.
 * Tanpa Hilt — manual DI via AppContainer.
 */
class DeviceIdentityProvider(context: Context) {

    private val appContext = context.applicationContext
    private val preferences = appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun deviceId(): String {
        val androidId = Settings.Secure.getString(appContext.contentResolver, Settings.Secure.ANDROID_ID)
        if (!androidId.isNullOrBlank() && androidId != LEGACY_BUGGED_ANDROID_ID) {
            return "android:$androidId"
        }

        val existing = preferences.getString(KEY_FALLBACK_DEVICE_ID, null)
        if (!existing.isNullOrBlank()) {
            return existing
        }

        val generated = "android:${UUID.randomUUID()}"
        preferences.edit().putString(KEY_FALLBACK_DEVICE_ID, generated).apply()
        return generated
    }

    fun deviceInfo(): Map<String, String> = mapOf(
        "platform" to "android",
        "app" to "merchant",
        "model" to (android.os.Build.MODEL ?: "unknown"),
        "sdk" to android.os.Build.VERSION.SDK_INT.toString()
    )

    private companion object {
        const val PREFS_NAME = "tembus_merchant_device_identity"
        const val KEY_FALLBACK_DEVICE_ID = "fallback_device_id"
        const val LEGACY_BUGGED_ANDROID_ID = "9774d56d682e549c"
    }
}
