package com.tembus.customer.ui.theme

import android.app.Activity
import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.unit.dp
import androidx.core.view.WindowCompat

private val DarkColorScheme = darkColorScheme(
    primary = PrimaryLight,
    onPrimary = PrimaryDark,
    primaryContainer = PrimaryDark,
    onPrimaryContainer = PrimaryLight,
    secondary = SecondaryLight,
    onSecondary = SecondaryDark,
    secondaryContainer = SecondaryDark,
    onSecondaryContainer = SecondaryLight,
    tertiary = AccentLight,
    onTertiary = Accent,
    tertiaryContainer = Accent,
    onTertiaryContainer = AccentLight,
    background = DarkBackground,
    surface = DarkSurface,
    surfaceVariant = DarkSurfaceVariant,
    outline = androidx.compose.ui.graphics.Color.White.copy(alpha = 0.12f),
    outlineVariant = androidx.compose.ui.graphics.Color.White.copy(alpha = 0.05f),
    onBackground = DarkOnBackground,
    onSurface = DarkOnSurface,
    onSurfaceVariant = DarkOnSurfaceVariant,
    error = Error,
    errorContainer = Error.copy(alpha = 0.18f),
    onError = OnPrimary,
    onErrorContainer = DarkOnSurface
)

private val LightColorScheme = lightColorScheme(
    primary = Primary,
    primaryContainer = PrimaryLight,
    onPrimaryContainer = PrimaryDark,
    secondary = Secondary,
    secondaryContainer = SecondaryLight,
    onSecondaryContainer = SecondaryDark,
    tertiary = Accent,
    tertiaryContainer = AccentLight,
    background = Background,
    surface = Surface,
    surfaceVariant = SurfaceVariant,
    outline = Outline,
    outlineVariant = OutlineStrong,
    onPrimary = OnPrimary,
    onSecondary = OnSecondary,
    onTertiary = OnAccent,
    onBackground = OnBackground,
    onSurface = OnSurface,
    onSurfaceVariant = OnSurfaceVariant,
    error = Error,
    errorContainer = Error.copy(alpha = 0.12f),
    onError = OnPrimary,
    onErrorContainer = Error
)

private val TembusShapes = Shapes(
    extraSmall = RoundedCornerShape(8.dp),
    small = RoundedCornerShape(12.dp),
    medium = RoundedCornerShape(TembusRadius.Input),
    large = RoundedCornerShape(TembusRadius.Card),
    extraLarge = RoundedCornerShape(TembusRadius.Sheet)
)

@Composable
fun TEMBUSCustomerTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    dynamicColor: Boolean = false,
    content: @Composable () -> Unit
) {
    val colorScheme = when {
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
            val context = LocalContext.current
            if (darkTheme) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        }
        darkTheme -> DarkColorScheme
        else -> LightColorScheme
    }

    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = androidx.compose.ui.graphics.Color.Transparent.toArgb()
            window.navigationBarColor = androidx.compose.ui.graphics.Color.Transparent.toArgb()
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = !darkTheme
            WindowCompat.getInsetsController(window, view).isAppearanceLightNavigationBars = !darkTheme
        }
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography,
        shapes = TembusShapes,
        content = content
    )
}
