package com.lancar.customer.util

import android.content.Context
import com.lancar.customer.BuildConfig
import com.lancar.customer.data.api.TEMBUSApiService
import com.lancar.customer.data.model.AppVersion
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * UpdateManager
 * 
 * Handles checking for app updates from the backend and comparing with local version.
 */
@Singleton
class UpdateManager @Inject constructor(
    private val apiService: TEMBUSApiService,
    @ApplicationContext private val context: Context
) {
    /**
     * Checks if a newer version is available on the backend.
     * Returns AppVersion if update available, null otherwise.
     */
    suspend fun checkUpdate(): AppVersion? {
        return try {
            val response = apiService.getLatestVersion("customer")
            if (response.isSuccessful) {
                val latest = response.body()
                // Compare backend version code with local BuildConfig.VERSION_CODE
                if (latest != null && latest.code > BuildConfig.VERSION_CODE) {
                    latest
                } else {
                    null
                }
            } else {
                null
            }
        } catch (e: Exception) {
            null
        }
    }

    /**
     * Returns current version name for display purposes
     */
    fun getCurrentVersionName(): String = BuildConfig.VERSION_NAME
    
    /**
     * Returns current version code
     */
    fun getCurrentVersionCode(): Int = BuildConfig.VERSION_CODE
}
