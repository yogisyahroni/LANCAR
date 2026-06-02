package com.tembus.customer.ui

// CI Retrigger: 2026-05-14T19:59


import android.os.Bundle
import android.widget.Toast
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import androidx.fragment.app.FragmentActivity
import com.tembus.customer.ui.screens.auth.AuthNavGraph
import com.tembus.customer.ui.theme.TEMBUSCustomerTheme
import dagger.hilt.android.AndroidEntryPoint

import androidx.compose.runtime.*
import com.tembus.customer.util.UpdateManager
import com.tembus.customer.ui.components.UpdateDialog
import com.tembus.customer.data.model.AppVersion
import javax.inject.Inject
import kotlinx.coroutines.launch

@AndroidEntryPoint
class MainActivity : FragmentActivity() {

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
            TEMBUSCustomerTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    // 📱 SYSTEM: App Update Logic
                    var updateInfo by remember { mutableStateOf<AppVersion?>(null) }
                    var isUpdating by remember { mutableStateOf(false) }
                    var updateError by remember { mutableStateOf<String?>(null) }
                    val updateScope = rememberCoroutineScope()
                    LaunchedEffect(Unit) {
                        updateInfo = updateManager.checkUpdate()
                    }

                    updateInfo?.let { info ->
                        UpdateDialog(
                            version = info,
                            isUpdating = isUpdating,
                            errorMessage = updateError,
                            onUpdateNow = {
                                updateError = null
                                isUpdating = true
                                updateScope.launch {
                                    val result = updateManager.downloadAndOpenInstaller(info)
                                    isUpdating = false
                                    result.onFailure { error ->
                                        if (error is UpdateManager.InstallPermissionRequiredException) {
                                            updateError = "Aktifkan izin instalasi update untuk TEMBUS, lalu tekan Update sekarang lagi."
                                            updateManager.openInstallPermissionSettings(this@MainActivity)
                                        } else {
                                            updateError = error.message ?: "Gagal menyiapkan update."
                                        }
                                    }
                                }
                            },
                            onDismiss = {
                                updateError = null
                                updateInfo = null
                            }
                        )
                    }

                    com.tembus.customer.ui.navigation.RootNavGraph()
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
