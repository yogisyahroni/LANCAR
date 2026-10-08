package com.tembus.customer.ui.theme

import android.content.Context
import androidx.compose.runtime.staticCompositionLocalOf

/** App-wide bridge so customer settings can update the root Compose theme. */
data class CustomerThemeController(
    val isDarkTheme: Boolean,
    val onDarkThemeChanged: (Boolean) -> Unit,
)

val LocalCustomerThemeController = staticCompositionLocalOf<CustomerThemeController> {
    error("CustomerThemeController belum disediakan oleh MainActivity")
}

/** Persists an explicit light/dark choice; null means follow the system theme. */
class CustomerThemePreferenceStore(context: Context) {
    private val preferences = context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

    fun readDarkTheme(): Boolean? = if (preferences.contains(KEY_DARK_THEME)) {
        preferences.getBoolean(KEY_DARK_THEME, false)
    } else {
        null
    }

    fun writeDarkTheme(enabled: Boolean) {
        preferences.edit().putBoolean(KEY_DARK_THEME, enabled).apply()
    }

    private companion object {
        const val PREFERENCES_NAME = "customer_theme_preferences"
        const val KEY_DARK_THEME = "dark_theme"
    }
}
