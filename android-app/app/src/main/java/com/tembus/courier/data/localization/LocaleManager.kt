package com.tembus.courier.data.localization

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.courierLanguageDataStore by preferencesDataStore(name = "courier_language")

/** Persists the courier's language choice independently from authentication state. */
class LocaleManager(private val context: Context) {
    enum class AppLanguage(val code: String, val label: String, val languageTag: String) {
        ID("id", "Bahasa Indonesia", "id-ID"),
        EN("en", "English", "en-US")
    }

    companion object {
        const val DEFAULT_LANG = LocaleContract.DEFAULT_LANGUAGE_CODE
        private val LANGUAGE_KEY = stringPreferencesKey("language_code")
    }

    val languageCode: Flow<String> = context.courierLanguageDataStore.data.map { preferences ->
        LocaleContract.languageCode(preferences[LANGUAGE_KEY])
    }

    suspend fun setLanguage(code: String) {
        context.courierLanguageDataStore.edit { preferences ->
            preferences[LANGUAGE_KEY] = LocaleContract.languageCode(code)
        }
    }
}
