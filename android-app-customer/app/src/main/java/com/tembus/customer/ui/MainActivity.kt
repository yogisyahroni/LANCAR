package com.tembus.customer.ui

// CI Retrigger: 2026-05-14T19:59


import android.os.Bundle
import android.widget.Toast
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import androidx.fragment.app.FragmentActivity
import com.tembus.customer.ui.screens.splash.CustomerLaunchSplash
import com.tembus.customer.ui.theme.TEMBUSCustomerTheme
import dagger.hilt.android.AndroidEntryPoint

import androidx.compose.runtime.*
import com.tembus.customer.util.UpdateManager
import com.tembus.customer.ui.components.UpdateDialog
import com.tembus.customer.data.model.AppVersion
import javax.inject.Inject
import kotlinx.coroutines.delay
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
                    var showLaunchSplash by remember { mutableStateOf(true) }
                    var launchSplashPresented by remember { mutableStateOf(false) }

                    LaunchedEffect(launchSplashPresented) {
                        if (launchSplashPresented) {
                            delay(3_000L)
                            showLaunchSplash = false
                        }
                    }

                    // App update logic runs after the launch splash finishes so
                    // the first Compose frame is always the branded splash image.
                    var updateInfo by remember { mutableStateOf<AppVersion?>(null) }
                    var isUpdating by remember { mutableStateOf(false) }
                    var updateError by remember { mutableStateOf<String?>(null) }
                    val updateScope = rememberCoroutineScope()
                    LaunchedEffect(showLaunchSplash) {
                        if (!showLaunchSplash) {
                            updateInfo = updateManager.checkUpdate()
                        }
                    }

                    if (showLaunchSplash) {
                        CustomerLaunchSplash(
                            onPresented = {
                                launchSplashPresented = true
                            }
                        )
                    } else {
                        Box(modifier = Modifier.fillMaxSize()) {
                            com.tembus.customer.ui.navigation.RootNavGraph()
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
                                                        .onFailure { permissionError ->
                                                            updateError = permissionError.message
                                                                ?: "Halaman izin install tidak bisa dibuka."
                                                        }
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
                        }
                    }
                }

            }
        }
    }

    private fun isLikelyRootedDevice(): Boolean {
        return try {
            // 1. Test-keys build tag — indicates a non-production kernel build
            val hasTestKeys = android.os.Build.TAGS?.contains("test-keys", ignoreCase = true) == true

            // 2. Known root management app packages
            val rootPackages = listOf(
                "com.topjohnwu.magisk",
                "io.github.vvb2060.magisk",
                "eu.chainfire.supersu",
                "com.koushikdutta.superuser",
                "me.weishu.kernelsu",
                "me.bmax.apatch"
            )
            val hasRootApp = rootPackages.any { pkg ->
                runCatching {
                    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
                        packageManager.getPackageInfo(pkg, android.content.pm.PackageManager.PackageInfoFlags.of(0))
                    } else {
                        @Suppress("DEPRECATION")
                        packageManager.getPackageInfo(pkg, 0)
                    }
                    true
                }.getOrDefault(false)
            }

            // 3. Suspicious su binary paths
            val suspiciousPaths = listOf(
                "/system/app/Superuser.apk",
                "/sbin/su",
                "/system/bin/su",
                "/system/xbin/su",
                "/data/local/xbin/su",
                "/data/local/bin/su",
                "/system/sd/xbin/su",
                "/system/bin/failsafe/su",
                "/data/local/su",
                "/su/bin/su"
            )
            val hasSuBinary = suspiciousPaths.any { path ->
                runCatching { java.io.File(path).exists() }.getOrDefault(false)
            }

            hasTestKeys || hasRootApp || hasSuBinary
        } catch (e: Exception) {
            // S2-MA-01 Fix: Fail-CLOSED — treat device as rooted on any unexpected
            // exception. Tampered environments may interfere with system calls.
            true
        }
    }
}
