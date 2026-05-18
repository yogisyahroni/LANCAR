package com.lancar.customer.ui

// CI Retrigger: 2026-05-14T19:59


import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import com.lancar.customer.ui.screens.auth.AuthNavGraph
import com.lancar.customer.ui.theme.LANCARCustomerTheme
import dagger.hilt.android.AndroidEntryPoint

import androidx.compose.runtime.*
import com.lancar.customer.util.UpdateManager
import com.lancar.customer.ui.components.UpdateDialog
import com.lancar.customer.data.model.AppVersion
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject
    lateinit var updateManager: UpdateManager


    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Root detection uses a lightweight Java/Kotlin heuristic here to keep the
        // customer app compatible with Android 15+ 16 KB page-size devices.
        if (isLikelyRootedDevice()) {
            Toast.makeText(this, "Aplikasi tidak dapat berjalan di perangkat yang di-root", Toast.LENGTH_LONG).show()
            finish()
            return
        }

        setContent {
            LANCARCustomerTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    // 📱 SYSTEM: App Update Logic
                    var updateInfo by remember { mutableStateOf<AppVersion?>(null) }
                    LaunchedEffect(Unit) {
                        updateInfo = updateManager.checkUpdate()
                    }

                    updateInfo?.let { info ->
                        UpdateDialog(
                            version = info,
                            onDismiss = { updateInfo = null }
                        )
                    }

                    com.lancar.customer.ui.navigation.RootNavGraph()
                }

            }
        }
    }

    private fun isLikelyRootedDevice(): Boolean {
        val suspiciousPaths = listOf(
            "/system/app/Superuser.apk",
            "/sbin/su",
            "/system/bin/su",
            "/system/xbin/su",
            "/data/local/xbin/su",
            "/data/local/bin/su",
            "/system/sd/xbin/su",
            "/system/bin/failsafe/su",
            "/data/local/su"
        )
        return suspiciousPaths.any { java.io.File(it).exists() }
    }
}
