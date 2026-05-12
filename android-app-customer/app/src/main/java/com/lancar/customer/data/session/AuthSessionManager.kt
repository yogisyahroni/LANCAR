package com.lancar.customer.data.session

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
 * Auth Session Manager for LANCAR Customer App
 */
class AuthSessionManager(private val context: Context) {

    private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "customer_auth_session")

    val isLoggedIn: Flow<Boolean> = context.dataStore.data.map { preferences ->
        !preferences[KEY_AUTH_TOKEN].isNullOrEmpty() &&
        !preferences[KEY_CUSTOMER_ID].isNullOrEmpty()
    }

    val authToken: Flow<String?> = context.dataStore.data.map { preferences ->
        preferences[KEY_AUTH_TOKEN]
    }

    val customerId: Flow<String?> = context.dataStore.data.map { preferences ->
        preferences[KEY_CUSTOMER_ID]
    }

    val customerName: Flow<String?> = context.dataStore.data.map { preferences ->
        preferences[KEY_CUSTOMER_NAME]
    }

    suspend fun saveSession(token: String, id: String, name: String? = "") {
        context.dataStore.edit { preferences ->
            preferences[KEY_AUTH_TOKEN] = token
            preferences[KEY_CUSTOMER_ID] = id
            preferences[KEY_CUSTOMER_NAME] = name ?: ""
        }
    }

    suspend fun clearSession() {
        context.dataStore.edit { preferences ->
            preferences.clear()
        }
    }

    suspend fun getTokenOnce(): String? {
        return context.dataStore.data.first()[KEY_AUTH_TOKEN]
    }

    companion object {
        private val KEY_AUTH_TOKEN = stringPreferencesKey("auth_token")
        private val KEY_CUSTOMER_ID = stringPreferencesKey("customer_id")
        private val KEY_CUSTOMER_NAME = stringPreferencesKey("customer_name")
    }
}
