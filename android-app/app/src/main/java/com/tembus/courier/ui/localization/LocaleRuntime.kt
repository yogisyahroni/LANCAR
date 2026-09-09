package com.tembus.courier.ui.localization

import android.content.Context
import android.content.res.Configuration
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.runtime.CompositionLocalProvider
import com.tembus.courier.data.localization.LocaleManager
import com.tembus.courier.data.localization.LocaleContract

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

    val direction = if (LocaleContract.isRtl(languageCode)) LayoutDirection.Rtl else LayoutDirection.Ltr
    CompositionLocalProvider(LocalLayoutDirection provides direction) { content() }
}

private fun Context.applyCourierLocale(languageCode: String) {
    val locale = LocaleContract.localeFor(languageCode)
    java.util.Locale.setDefault(locale)
    val configuration = Configuration(resources.configuration)
    configuration.setLocale(locale)
    @Suppress("DEPRECATION")
    resources.updateConfiguration(configuration, resources.displayMetrics)
}
