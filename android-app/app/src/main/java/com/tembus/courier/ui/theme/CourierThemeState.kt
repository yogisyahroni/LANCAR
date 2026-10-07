package com.tembus.courier.ui.theme

import android.content.Context
import androidx.compose.runtime.staticCompositionLocalOf

/** Small app-wide bridge so Settings can update the root Compose theme. */
data class CourierThemeController(
    val isDarkTheme: Boolean,
    val onDarkThemeChanged: (Boolean) -> Unit
)

internal val LocalCourierThemeController = staticCompositionLocalOf<CourierThemeController> {
    error("CourierThemeController belum disediakan oleh MainActivity")
}

/** Persists the explicit light/dark choice without adding another runtime dependency. */
class CourierThemePreferenceStore(context: Context) {
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
        const val PREFERENCES_NAME = "courier_theme_preferences"
        const val KEY_DARK_THEME = "dark_theme"
    }
}
