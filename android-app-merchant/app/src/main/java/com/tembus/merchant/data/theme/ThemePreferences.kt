package com.tembus.merchant.data.theme

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

enum class ThemeMode {
    LIGHT,
    DARK
}

/** Application-owned theme choice; it deliberately does not follow the device setting. */
class ThemePreferences(context: Context) {
    private val preferences = context.applicationContext.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE)
    private val _mode = MutableStateFlow(readMode())

    val mode: StateFlow<ThemeMode> = _mode.asStateFlow()

    fun setMode(mode: ThemeMode) {
        if (_mode.value == mode) return
        preferences.edit().putString(KEY_MODE, mode.name).apply()
        _mode.value = mode
    }

    private fun readMode(): ThemeMode = runCatching {
        ThemeMode.valueOf(preferences.getString(KEY_MODE, ThemeMode.LIGHT.name) ?: ThemeMode.LIGHT.name)
    }.getOrDefault(ThemeMode.LIGHT)

    private companion object {
        const val FILE_NAME = "merchant_theme_preferences"
        const val KEY_MODE = "theme_mode"
    }
}
