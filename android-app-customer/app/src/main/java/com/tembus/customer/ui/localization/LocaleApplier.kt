package com.tembus.customer.ui.localization

import android.content.Context
import android.content.res.Configuration
import android.os.Build
import com.tembus.customer.data.localization.LocaleManager as AppLocaleManager
import dagger.hilt.android.qualifiers.ApplicationContext
import java.util.Locale
import javax.inject.Inject

/**
 * C7: Terapkan bahasa tersimpan ke app context saat startup.
 * Menggunakan Configuration.setLocale (kompatibel semua API level, tanpa
 * dependensi appcompat). UI yang dipakai stringResource otomatis mengikuti
 * context baru yang dibuat ulang oleh sistem.
 */
class LocaleApplier @Inject constructor(
    @ApplicationContext private val context: Context,
    private val appLocaleManager: AppLocaleManager
) {
    suspend fun applySavedLanguage() {
        val code = appLocaleManager.getLanguageCode()
        applyLanguage(code)
    }

    fun applyLanguage(code: String) {
        val locale = Locale.forLanguageTag(code)
        Locale.setDefault(locale)
        val config = Configuration(context.resources.configuration)
        config.setLocale(locale)
        @Suppress("DEPRECATION")
        context.resources.updateConfiguration(config, context.resources.displayMetrics)
    }
}
