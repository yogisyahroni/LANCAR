package com.tembus.courier.util

import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.os.Build
import android.provider.Settings
import java.io.File

/**
 * Security Utilities for TEMBUS Courier App
 *
 * Contains checks for rooted devices, mock locations, and tampered environments.
 */
object SecurityUtils {
    private val rootManagementPackages = setOf(
        "com.noshufou.android.su",
        "com.noshufou.android.su.elite",
        "eu.chainfire.supersu",
        "com.koushikdutta.superuser",
        "com.thirdparty.superuser",
        "com.yellowes.su",
        "com.topjohnwu.magisk",
        "io.github.vvb2060.magisk",
        "me.weishu.kernelsu",
        "me.bmax.apatch"
    )

    private val suspiciousBinaryPaths = listOf(
        "/system/app/Superuser.apk",
        "/sbin/su",
        "/system/bin/su",
        "/system/xbin/su",
        "/data/local/xbin/su",
        "/data/local/bin/su",
        "/system/sd/xbin/su",
        "/system/bin/failsafe/su",
        "/data/local/su",
        "/su/bin/su",
        "/system/bin/.ext/.su",
        "/system/usr/we-need-root/su-backup",
        "/cache/su",
        "/data/su"
    )

    /**
     * Check if the device is rooted without native libraries.
     *
     * Native root checkers can break on Android 15+ 16 KB page-size devices when
     * their bundled .so files are not rebuilt with 16 KB ELF segment alignment.
     */
    fun isDeviceRooted(context: Context): Boolean {
        return try {
            hasTestKeys() ||
                hasKnownRootManagementPackage(context) ||
                hasSuspiciousRootBinary()
        } catch (e: Exception) {
            // S2-MA-01 Fix: Fail-CLOSED — if root detection throws (which can happen on
            // tampered environments that interfere with system APIs), treat the device as
            // rooted. Returning false on exception would allow an attacker to bypass
            // detection by causing a controlled crash.
            true
        }
    }

    private fun hasTestKeys(): Boolean {
        return Build.TAGS?.contains("test-keys", ignoreCase = true) == true
    }

    private fun hasKnownRootManagementPackage(context: Context): Boolean {
        val packageManager = context.packageManager
        return rootManagementPackages.any { packageName ->
            runCatching {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    packageManager.getPackageInfo(packageName, PackageManager.PackageInfoFlags.of(0))
                } else {
                    @Suppress("DEPRECATION")
                    packageManager.getPackageInfo(packageName, 0)
                }
                true
            }.getOrDefault(false)
        }
    }

    private fun hasSuspiciousRootBinary(): Boolean {
        return suspiciousBinaryPaths.any { path ->
            runCatching {
                val file = File(path)
                file.exists() && (file.canExecute() || file.name == "Superuser.apk")
            }.getOrDefault(false)
        }
    }

    /**
     * Comprehensive Mock Location detection based on modern SDK requirements
     */
    fun isMockLocation(location: Location?): Boolean {
        if (location == null) return false
        
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                // Modern Android 12+ Direct Mock API check
                location.isMock
            } else {
                // Older API check via deprecated isFromMockProvider flag
                @Suppress("DEPRECATION")
                location.isFromMockProvider
            }
        } catch (e: Exception) {
            false
        }
    }

    /**
     * Check if Developer Options are enabled on the device.
     * This is a risk indicator (not a definitive signal) because
     * mock location providers require Developer Options to be active.
     */
    fun isDeveloperOptionsEnabled(context: Context): Boolean {
        return try {
            Settings.Global.getInt(
                context.contentResolver,
                Settings.Global.DEVELOPMENT_SETTINGS_ENABLED, 0
            ) != 0
        } catch (e: Exception) {
            false
        }
    }

    /**
     * Check if USB Debugging (ADB) is enabled.
     * ADB access allows injecting mock locations via command line.
     */
    fun isUsbDebuggingEnabled(context: Context): Boolean {
        return try {
            Settings.Global.getInt(
                context.contentResolver,
                Settings.Global.ADB_ENABLED, 0
            ) != 0
        } catch (e: Exception) {
            false
        }
    }

    /**
     * Check if the mock location setting is enabled in Developer Options.
     * On pre-M devices, this is a direct setting. On M+, it is managed
     * per-app through Developer Options.
     */
    fun isMockLocationSettingEnabled(context: Context): Boolean {
        return try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
                @Suppress("DEPRECATION")
                Settings.Secure.getString(
                    context.contentResolver,
                    "mock_location"
                ) != "0"
            } else {
                isDeveloperOptionsEnabled(context)
            }
        } catch (e: Exception) {
            false
        }
    }

    /**
     * Find all installed apps that declare the ACCESS_MOCK_LOCATION permission,
     * excluding system apps and known legitimate developer tools.
     *
     * @return List of package names that have mock location capability.
     */
    fun getAppsWithMockPermission(context: Context): List<String> {
        val result = mutableListOf<String>()
        val systemWhitelist = setOf(
            "com.android.shell",
            "com.google.android.gms",
            "com.android.providers.settings",
            "com.android.settings"
        )

        try {
            val packages = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                context.packageManager.getInstalledPackages(
                    PackageManager.PackageInfoFlags.of(PackageManager.GET_PERMISSIONS.toLong())
                )
            } else {
                @Suppress("DEPRECATION")
                context.packageManager.getInstalledPackages(PackageManager.GET_PERMISSIONS)
            }

            for (pkg in packages) {
                val pkgName = pkg.packageName ?: continue
                if (systemWhitelist.contains(pkgName)) continue

                val perms = pkg.requestedPermissions ?: continue
                if (perms.any { it == "android.permission.ACCESS_MOCK_LOCATION" }) {
                    result.add(pkgName)
                }
            }
        } catch (e: Exception) {
            // PackageManager query failed — return empty
        }

        return result
    }

    /**
     * Detect if the app is running on an Android emulator.
     * Checks multiple heuristics: fingerprint, model, hardware, product.
     *
     * @return true if running on a known emulator environment.
     */
    fun isRunningOnEmulator(): Boolean {
        return try {
            (Build.FINGERPRINT.startsWith("generic") ||
                Build.FINGERPRINT.startsWith("unknown") ||
                Build.MODEL.contains("google_sdk", ignoreCase = true) ||
                Build.MODEL.contains("Emulator", ignoreCase = true) ||
                Build.MODEL.contains("Android SDK built for", ignoreCase = true) ||
                Build.MANUFACTURER.contains("Genymotion", ignoreCase = true) ||
                Build.BRAND.startsWith("generic") ||
                Build.DEVICE.startsWith("generic") ||
                Build.PRODUCT == "sdk" ||
                Build.PRODUCT == "sdk_gphone64_arm64" ||
                Build.PRODUCT == "sdk_gphone_x86_64" ||
                Build.PRODUCT.startsWith("sdk_") ||
                Build.HARDWARE.contains("goldfish") ||
                Build.HARDWARE.contains("ranchu"))
        } catch (e: Exception) {
            false
        }
    }
}
