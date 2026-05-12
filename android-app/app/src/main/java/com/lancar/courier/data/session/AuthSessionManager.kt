package com.lancar.courier.data.session

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

/**
 * Auth Session Manager for LANCAR Courier App
 *
 * Manages courier authentication session using DataStore.
 * Stores auth token, courier ID, and courier name.
 */
class AuthSessionManager(private val context: Context) {

    private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "auth_session")

    /**
     * Check if courier is logged in
     */
    val isLoggedIn: Flow<Boolean> = context.dataStore.data.map { preferences ->
        !preferences[KEY_AUTH_TOKEN].isNullOrEmpty() &&
        !preferences[KEY_COURIER_ID].isNullOrEmpty()
    }

    /**
     * Get auth token for API calls
     */
    val authToken: Flow<String?> = context.dataStore.data.map { preferences ->
        preferences[KEY_AUTH_TOKEN]
    }

    /**
     * Get courier ID
     */
    val courierId: Flow<String?> = context.dataStore.data.map { preferences ->
        preferences[KEY_COURIER_ID]
    }

    /**
     * Get courier display name
     */
    val courierName: Flow<String?> = context.dataStore.data.map { preferences ->
        preferences[KEY_COURIER_NAME]
    }

    /**
     * Save session after successful login
     */
    suspend fun saveSession(authToken: String, courierId: String, courierName: String = "") {
        context.dataStore.edit { preferences ->
            preferences[KEY_AUTH_TOKEN] = authToken
            preferences[KEY_COURIER_ID] = courierId
            preferences[KEY_COURIER_NAME] = courierName
        }
    }

    /**
     * Clear session on logout
     */
    suspend fun clearSession() {
        context.dataStore.edit { preferences ->
            preferences.remove(KEY_AUTH_TOKEN)
            preferences.remove(KEY_COURIER_ID)
            preferences.remove(KEY_COURIER_NAME)
        }
    }

    /**
     * Get current session — safe one-shot read using first()
     * Returns null if not logged in
     */
    suspend fun getSession(): SessionData? {
        val preferences = context.dataStore.data.first()
        val token = preferences[KEY_AUTH_TOKEN]
        val cid = preferences[KEY_COURIER_ID]
        val name = preferences[KEY_COURIER_NAME] ?: ""
        return if (!token.isNullOrEmpty() && !cid.isNullOrEmpty()) {
            SessionData(token, cid, name)
        } else null
    }

    data class SessionData(
        val authToken: String,
        val courierId: String,
        val courierName: String = ""
    )

    companion object {
        private val KEY_AUTH_TOKEN = stringPreferencesKey("auth_token")
        private val KEY_COURIER_ID = stringPreferencesKey("courier_id")
        private val KEY_COURIER_NAME = stringPreferencesKey("courier_name")
    }
}
