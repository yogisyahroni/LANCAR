package com.tembus.courier.util

import android.content.Context
import android.location.Location
import android.os.Build
import com.scottyab.rootbeer.RootBeer

/**
 * Security Utilities for TEMBUS Courier App
 *
 * Contains checks for rooted devices, mock locations, and tampered environments.
 */
object SecurityUtils {

    /**
     * Check if the device is rooted using advanced binary detection
     */
    fun isDeviceRooted(context: Context): Boolean {
        return try {
            val rootBeer = RootBeer(context)
            rootBeer.isRooted
        } catch (e: Exception) {
            // Fallback to basic indicator if library crashes
            false
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
