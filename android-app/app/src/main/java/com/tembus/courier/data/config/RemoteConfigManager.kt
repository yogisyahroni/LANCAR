package com.tembus.courier.data.config

import android.content.Context
import android.content.SharedPreferences
import com.tembus.courier.data.api.TEMBUSApiService
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class RemoteConfigManager @Inject constructor(
    @ApplicationContext private val context: Context,
    private val apiService: TEMBUSApiService
) {
    private val prefs: SharedPreferences = context.getSharedPreferences("remote_config_prefs", Context.MODE_PRIVATE)

    suspend fun fetchConfig() {
        withContext(Dispatchers.IO) {
            try {
                val response = apiService.getRuntimeConfig()
                if (response.isSuccessful) {
                    response.body()?.data?.let { config ->
                        val editor = prefs.edit()
                        config.courierSyncIntervalMs?.let { editor.putLong("courier_sync_interval_ms", it) }
                        editor.apply()
                    }
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    fun getSyncInterval(): Long {
        return prefs.getLong("courier_sync_interval_ms", 30_000L)
    }
}
