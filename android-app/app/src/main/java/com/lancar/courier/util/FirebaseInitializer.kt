package com.lancar.courier.util

import android.content.Context
import android.util.Log
import com.google.firebase.FirebaseApp

object FirebaseInitializer {
    private const val TAG = "FirebaseInitializer"

    fun initializeIfConfigured(context: Context): Boolean {
        if (FirebaseApp.getApps(context).isNotEmpty()) {
            return true
        }

        val apiKey = readStringResource(context, "google_api_key")
        if (!isValidFirebaseApiKey(apiKey)) {
            Log.w(TAG, "Firebase disabled: google-services.json API key is missing or still a placeholder")
            return false
        }

        return try {
            FirebaseApp.initializeApp(context) != null
        } catch (e: IllegalArgumentException) {
            Log.e(TAG, "Firebase disabled: failed to initialize Firebase options", e)
            false
        } catch (e: IllegalStateException) {
            Log.e(TAG, "Firebase disabled: Firebase is not ready", e)
            false
        }
    }

    fun isInitialized(context: Context): Boolean {
        return FirebaseApp.getApps(context).isNotEmpty()
    }

    private fun readStringResource(context: Context, name: String): String? {
        val id = context.resources.getIdentifier(name, "string", context.packageName)
        return if (id == 0) null else context.getString(id)
    }

    private fun isValidFirebaseApiKey(apiKey: String?): Boolean {
        if (apiKey.isNullOrBlank()) return false

        val normalized = apiKey.lowercase()
        val placeholderMarkers = listOf(
            "dummy",
            "placeholder",
            "replace",
            "client_apikey",
            "apikey"
        )

        return apiKey.startsWith("AIza") && placeholderMarkers.none { normalized.contains(it) }
    }
}
