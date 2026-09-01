package com.tembus.courier.ui.localization

import android.content.Context
import android.content.res.Configuration
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import com.tembus.courier.data.localization.LocaleManager
import java.util.Locale

/** Provides the persisted courier locale to all Compose screens. */
@Composable
fun CourierLocaleRuntime(content: @Composable () -> Unit) {
    val context = LocalContext.current
    val manager = remember(context.applicationContext) { LocaleManager(context.applicationContext) }
    val languageCode by manager.languageCode.collectAsState(initial = LocaleManager.DEFAULT_LANG)

    // Keep LocalContext pointing to the Activity. Hilt's Compose integration uses
    // that context to create @HiltViewModel instances; providing the raw
    // createConfigurationContext() result here turns it into ContextImpl and
    // crashes the login screen before it can render.
    LaunchedEffect(context, languageCode) {
        context.applyCourierLocale(languageCode)
    }

    content()
}

private fun Context.applyCourierLocale(languageCode: String) {
    val locale = Locale.forLanguageTag(languageCode)
    Locale.setDefault(locale)
    val configuration = Configuration(resources.configuration)
    configuration.setLocale(locale)
    @Suppress("DEPRECATION")
    resources.updateConfiguration(configuration, resources.displayMetrics)
}
