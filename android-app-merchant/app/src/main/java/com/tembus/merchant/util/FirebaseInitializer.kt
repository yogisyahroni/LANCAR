package com.tembus.merchant.util

import android.content.Context
import android.util.Log
import com.google.firebase.FirebaseApp

/** Optional Firebase bootstrap; merchant startup remains functional without project config. */
object FirebaseInitializer {
    private const val TAG = "FirebaseInitializer"

    fun initializeIfConfigured(context: Context): Boolean {
        if (FirebaseApp.getApps(context).isNotEmpty()) return true
        val apiKey = readStringResource(context, "google_api_key")
        if (!isValidFirebaseApiKey(apiKey)) {
            Log.w(TAG, "Firebase disabled: google-services.json API key is missing or placeholder")
            return false
        }
        return runCatching { FirebaseApp.initializeApp(context) != null }
            .onFailure { Log.e(TAG, "Firebase disabled: initialization failed", it) }
            .getOrDefault(false)
    }

    fun isInitialized(context: Context): Boolean = FirebaseApp.getApps(context).isNotEmpty()

    private fun readStringResource(context: Context, name: String): String? {
        val id = context.resources.getIdentifier(name, "string", context.packageName)
        return if (id == 0) null else context.getString(id)
    }

    private fun isValidFirebaseApiKey(apiKey: String?): Boolean {
        if (apiKey.isNullOrBlank()) return false
        val normalized = apiKey.lowercase()
        return apiKey.startsWith("AIza") && listOf("dummy", "placeholder", "replace", "client_apikey", "apikey")
            .none { normalized.contains(it) }
    }
}
