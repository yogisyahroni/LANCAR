package com.lancar.customer.data.device

import android.content.Context
import android.os.Build
import android.provider.Settings
import dagger.hilt.android.qualifiers.ApplicationContext
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class DeviceIdentityProvider @Inject constructor(
    @ApplicationContext private val context: Context
) {
    private val preferences = context.getSharedPreferences("lancar_customer_device_identity", Context.MODE_PRIVATE)

    fun deviceId(): String {
        val androidId = Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)
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
        "app" to "customer",
        "brand" to Build.BRAND.orEmpty(),
        "manufacturer" to Build.MANUFACTURER.orEmpty(),
        "model" to Build.MODEL.orEmpty(),
        "sdk" to Build.VERSION.SDK_INT.toString(),
        "release" to Build.VERSION.RELEASE.orEmpty()
    )

    private companion object {
        const val KEY_FALLBACK_DEVICE_ID = "fallback_device_id"
        const val LEGACY_BUGGED_ANDROID_ID = "9774d56d682e549c"
    }
}
