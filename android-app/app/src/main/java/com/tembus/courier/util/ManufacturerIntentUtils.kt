package com.tembus.courier.util

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log

object ManufacturerIntentUtils {

    private const val TAG = "ManufacturerIntent"

    /**
     * Tries to open the manufacturer-specific auto-start or background execution settings screen.
     * If not found, falls back to the standard Android Battery Optimization settings.
     */
    fun openBatteryOptimizationSettings(context: Context) {
        try {
            val intent = Intent()
            val manufacturer = Build.MANUFACTURER.lowercase()

            when {
                manufacturer.contains("xiaomi") || manufacturer.contains("redmi") || manufacturer.contains("poco") -> {
                    intent.component = ComponentName(
                        "com.miui.securitycenter",
                        "com.miui.permcenter.autostart.AutoStartManagementActivity"
                    )
                }
                manufacturer.contains("oppo") -> {
                    intent.component = ComponentName(
                        "com.coloros.safecenter",
                        "com.coloros.safecenter.startupapp.StartupAppListActivity"
                    )
                }
                manufacturer.contains("vivo") -> {
                    intent.component = ComponentName(
                        "com.vivo.permissionmanager",
                        "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"
                    )
                }
                manufacturer.contains("letv") -> {
                    intent.component = ComponentName(
                        "com.letv.android.letvsafe",
                        "com.letv.android.letvsafe.AutobootManageActivity"
                    )
                }
                manufacturer.contains("honor") -> {
                    intent.component = ComponentName(
                        "com.huawei.systemmanager",
                        "com.huawei.systemmanager.optimize.process.ProtectActivity"
                    )
                }
                else -> {
                    // Fallback to default Android setting
                    intent.action = Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS
                    intent.data = Uri.parse("package:${context.packageName}")
                }
            }

            // Check if the intent resolves to an activity
            if (intent.resolveActivity(context.packageManager) != null) {
                context.startActivity(intent)
            } else {
                fallbackToDefaultSettings(context)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to open auto-start settings for ${Build.MANUFACTURER}", e)
            fallbackToDefaultSettings(context)
        }
    }

    private fun fallbackToDefaultSettings(context: Context) {
        try {
            val fallbackIntent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                data = Uri.parse("package:${context.packageName}")
            }
            context.startActivity(fallbackIntent)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to open default battery optimization settings", e)
            // Final fallback: just open application details
            try {
                val appSettingsIntent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                    data = Uri.parse("package:${context.packageName}")
                }
                context.startActivity(appSettingsIntent)
            } catch (ex: Exception) {
                Log.e(TAG, "Failed all attempts to open settings", ex)
            }
        }
    }
}
