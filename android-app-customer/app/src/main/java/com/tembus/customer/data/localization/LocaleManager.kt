package com.tembus.customer.data.localization

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

private val Context.languageDataStore by preferencesDataStore(name = "app_language")

/**
 * C7: Multi-bahasa (i18n) — manager pilihan bahasa (id default, en).
 * Disimpan di DataStore; dibaca saat app start untuk terapkan locale.
 */
@Singleton
class LocaleManager @Inject constructor(@ApplicationContext private val context: Context) {

    enum class AppLanguage(val code: String, val label: String, val languageTag: String) {
        ID("id", "Bahasa Indonesia", "id-ID"),
        EN("en", "English", "en-US")
    }

    companion object {
        const val DEFAULT_LANG = LocaleContract.DEFAULT_LANGUAGE_CODE
        private val LANGUAGE_KEY = stringPreferencesKey("language_code")
    }

    suspend fun getLanguageCode(): String {
        return context.languageDataStore.data.map { prefs ->
            LocaleContract.languageCode(prefs[LANGUAGE_KEY])
        }.first()
    }

    suspend fun setLanguageCode(code: String) {
        context.languageDataStore.edit { prefs ->
            prefs[LANGUAGE_KEY] = LocaleContract.languageCode(code)
        }
    }

    fun fromCode(code: String): AppLanguage =
        AppLanguage.values().firstOrNull { it.code == code } ?: AppLanguage.ID
}
