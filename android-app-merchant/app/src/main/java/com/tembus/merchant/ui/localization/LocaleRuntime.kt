package com.tembus.merchant.ui.localization

import android.content.Context
import android.content.res.Configuration
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.platform.LocalContext
import com.tembus.merchant.data.localization.LocaleManager
import java.util.Locale

/** Provides the persisted merchant locale to every Compose screen. */
@Composable
fun MerchantLocaleRuntime(content: @Composable () -> Unit) {
    val context = LocalContext.current
    val manager = remember(context.applicationContext) { LocaleManager(context.applicationContext) }
    val languageCode by manager.languageCode.collectAsState(initial = LocaleManager.DEFAULT_LANG)
    // Keep LocalContext pointing to the Activity. Hilt's Compose integration
    // needs the Activity context when creating merchant ViewModels.
    LaunchedEffect(context, languageCode) {
        context.applyMerchantLocale(languageCode)
    }

    content()
}

private fun Context.applyMerchantLocale(languageCode: String) {
    val locale = Locale.forLanguageTag(languageCode)
    Locale.setDefault(locale)
    val configuration = Configuration(resources.configuration)
    configuration.setLocale(locale)
    @Suppress("DEPRECATION")
    resources.updateConfiguration(configuration, resources.displayMetrics)
}
