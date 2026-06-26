package com.tembus.customer.ui.screens.splash

import android.app.Activity
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.painterResource
import androidx.core.view.WindowCompat
import com.tembus.customer.R

private val SplashBackground = Color(0xFF004A2A)

@Composable
fun CustomerLaunchSplash(
    modifier: Modifier = Modifier,
    onPresented: () -> Unit = {}
) {
    val view = LocalView.current
    var isPositioned by remember { mutableStateOf(false) }

    LaunchedEffect(isPositioned) {
        if (isPositioned) {
            onPresented()
        }
    }

    if (!view.isInEditMode) {
        androidx.compose.runtime.DisposableEffect(view) {
            val window = (view.context as Activity).window
            val originalStatusBarColor = window.statusBarColor
            val originalNavigationBarColor = window.navigationBarColor
            val controller = WindowCompat.getInsetsController(window, view)
            val originalLightStatusBars = controller.isAppearanceLightStatusBars
            val originalLightNavBars = controller.isAppearanceLightNavigationBars

            window.statusBarColor = SplashBackground.toArgb()
            window.navigationBarColor = SplashBackground.toArgb()
            controller.isAppearanceLightStatusBars = false
            controller.isAppearanceLightNavigationBars = false

            onDispose {
                window.statusBarColor = androidx.compose.ui.graphics.Color.Transparent.toArgb()
                window.navigationBarColor = androidx.compose.ui.graphics.Color.Transparent.toArgb()
                controller.isAppearanceLightStatusBars = originalLightStatusBars
                controller.isAppearanceLightNavigationBars = originalLightNavBars
            }
        }
    }

    Image(
        painter = painterResource(id = R.drawable.img_customer_splash_screen),
        contentDescription = null,
        contentScale = ContentScale.FillBounds,
        modifier = modifier
            .fillMaxSize()
            .background(SplashBackground)
            .onGloballyPositioned {
                if (!isPositioned) {
                    isPositioned = true
                }
            }
    )
}
