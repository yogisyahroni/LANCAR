package com.lancar.customer.data.device

import android.content.Context
import android.content.SharedPreferences
import android.os.Build
import android.provider.Settings
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import dagger.hilt.android.qualifiers.ApplicationContext
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class DeviceIdentityProvider @Inject constructor(
    @ApplicationContext private val context: Context
) {
    private val preferences: SharedPreferences by lazy {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()

        EncryptedSharedPreferences.create(
            context,
            SECURE_PREFS_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    private val legacyPreferences: SharedPreferences by lazy {
        context.getSharedPreferences(LEGACY_PREFS_NAME, Context.MODE_PRIVATE)
    }

    fun deviceId(): String {
        val androidId = Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)
        if (!androidId.isNullOrBlank() && androidId != LEGACY_BUGGED_ANDROID_ID) {
            return "android:$androidId"
        }

        val existing = preferences.getString(KEY_FALLBACK_DEVICE_ID, null)
        if (!existing.isNullOrBlank()) {
            return existing
        }

        val legacy = legacyPreferences.getString(KEY_FALLBACK_DEVICE_ID, null)
        if (!legacy.isNullOrBlank()) {
            preferences.edit().putString(KEY_FALLBACK_DEVICE_ID, legacy).apply()
            legacyPreferences.edit().remove(KEY_FALLBACK_DEVICE_ID).apply()
            return legacy
        }

        val generated = "android:${UUID.randomUUID()}"
        preferences.edit().putString(KEY_FALLBACK_DEVICE_ID, generated).apply()
        return generated
    }

    fun deviceInfo(): Map<String, String> = mapOf(
        "platform" to "android",
        "app" to "customer",
        "brand" to Build.BRAND.orEmpty(),
        "manufacturer" to Build.MANUFACTURER.orEmpty(),
        "model" to Build.MODEL.orEmpty(),
        "sdk" to Build.VERSION.SDK_INT.toString(),
        "release" to Build.VERSION.RELEASE.orEmpty()
    )

    private companion object {
        const val SECURE_PREFS_NAME = "secure_lancar_customer_device_identity"
        const val LEGACY_PREFS_NAME = "lancar_customer_device_identity"
        const val KEY_FALLBACK_DEVICE_ID = "fallback_device_id"
        const val LEGACY_BUGGED_ANDROID_ID = "9774d56d682e549c"
    }
}
