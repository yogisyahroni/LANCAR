package com.tembus.merchant.data.localization

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.merchantLanguageDataStore by preferencesDataStore(name = "merchant_language")

/** Persists the merchant's language choice without coupling it to auth/session state. */
class LocaleManager(private val context: Context) {
    enum class AppLanguage(val code: String, val label: String, val languageTag: String) {
        ID("id", "Bahasa Indonesia", "id-ID"),
        EN("en", "English", "en-US")
    }

    companion object {
        const val DEFAULT_LANG = LocaleContract.DEFAULT_LANGUAGE_CODE
        private val LANGUAGE_KEY = stringPreferencesKey("language_code")
    }

    val languageCode: Flow<String> = context.merchantLanguageDataStore.data.map { preferences ->
        LocaleContract.languageCode(preferences[LANGUAGE_KEY])
    }

    suspend fun setLanguage(code: String) {
        context.merchantLanguageDataStore.edit { preferences ->
            preferences[LANGUAGE_KEY] = LocaleContract.languageCode(code)
        }
    }
}
