package com.tembus.courier.util

import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.os.Build
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
}
