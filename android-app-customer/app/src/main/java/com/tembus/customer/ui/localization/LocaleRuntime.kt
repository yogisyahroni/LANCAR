package com.tembus.customer.ui.localization

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.runtime.CompositionLocalProvider
import com.tembus.customer.data.localization.LocaleContract
import com.tembus.customer.data.localization.LocaleManager

/** Applies the saved customer locale and exposes the matching Compose direction. */
@Composable
fun CustomerLocaleRuntime(content: @Composable () -> Unit) {
    val context = LocalContext.current
    val manager = remember(context.applicationContext) { LocaleManager(context.applicationContext) }
    var languageCode by remember { mutableStateOf(LocaleManager.DEFAULT_LANG) }

    LaunchedEffect(manager) {
        languageCode = manager.getLanguageCode()
    }
    LaunchedEffect(context, languageCode) {
        context.applyCustomerLocale(languageCode)
    }

    val direction = if (LocaleContract.isRtl(languageCode)) LayoutDirection.Rtl else LayoutDirection.Ltr
    CompositionLocalProvider(LocalLayoutDirection provides direction) { content() }
}

private fun android.content.Context.applyCustomerLocale(languageCode: String) {
    val locale = LocaleContract.localeFor(languageCode)
    java.util.Locale.setDefault(locale)
    val configuration = android.content.res.Configuration(resources.configuration)
    configuration.setLocale(locale)
    @Suppress("DEPRECATION")
    resources.updateConfiguration(configuration, resources.displayMetrics)
}
