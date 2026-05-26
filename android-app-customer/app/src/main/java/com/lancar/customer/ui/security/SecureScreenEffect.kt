package com.lancar.customer.ui.security

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.view.WindowManager
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.ui.platform.LocalView
import com.lancar.customer.BuildConfig

@Composable
fun SecureScreenEffect(enabled: Boolean = true) {
    val view = LocalView.current
    val activity = view.context.findActivity()
    val shouldProtect = enabled && !BuildConfig.DEBUG

    DisposableEffect(activity, shouldProtect) {
        if (activity != null && shouldProtect) {
            activity.window.setFlags(
                WindowManager.LayoutParams.FLAG_SECURE,
                WindowManager.LayoutParams.FLAG_SECURE
            )
        }

        onDispose {
            if (activity != null && shouldProtect) {
                activity.window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
            }
        }
    }
}

private tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}
