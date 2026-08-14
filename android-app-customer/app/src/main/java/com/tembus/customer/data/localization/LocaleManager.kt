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

    enum class AppLanguage(val code: String, val label: String) {
        ID("id", "Bahasa Indonesia"),
        EN("en", "English")
    }

    companion object {
        const val DEFAULT_LANG = "id"
        private val LANGUAGE_KEY = stringPreferencesKey("language_code")
    }

    suspend fun getLanguageCode(): String {
        return context.languageDataStore.data.map { prefs ->
            prefs[LANGUAGE_KEY] ?: DEFAULT_LANG
        }.first()
    }

    suspend fun setLanguageCode(code: String) {
        context.languageDataStore.edit { prefs ->
            prefs[LANGUAGE_KEY] = if (code in AppLanguage.values().map { it.code }) code else DEFAULT_LANG
        }
    }

    fun fromCode(code: String): AppLanguage =
        AppLanguage.values().firstOrNull { it.code == code } ?: AppLanguage.ID
}
