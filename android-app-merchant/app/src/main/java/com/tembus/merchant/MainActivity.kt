package com.tembus.merchant

import android.os.Bundle
import android.content.Intent
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import com.tembus.merchant.TEMBUSApplication
import com.tembus.merchant.data.model.AppVersion
import com.tembus.merchant.ui.components.UpdateDialog
import com.tembus.merchant.ui.navigation.AppNavHost
import com.tembus.merchant.ui.navigation.MerchantDeepLinkBus
import com.tembus.merchant.ui.theme.TEMBUSMerchantTheme
import com.tembus.merchant.ui.localization.MerchantLocaleRuntime
import com.tembus.merchant.util.UpdateManager
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {

    private lateinit var updateManager: UpdateManager

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        MerchantDeepLinkBus.publish(intent?.data)

        val app = application as TEMBUSApplication
        updateManager = app.container.updateManager

        setContent {
            MerchantLocaleRuntime {
                TEMBUSMerchantTheme {
                // Auto-update: cek setelah MainActivity tampil; dialog overlay
                // di atas seluruh app (pola sama dengan customer/courier).
                var updateInfo by remember { mutableStateOf<AppVersion?>(null) }
                var isUpdating by remember { mutableStateOf(false) }
                var updateError by remember { mutableStateOf<String?>(null) }
                val updateScope = rememberCoroutineScope()

                LaunchedEffect(Unit) {
                    updateInfo = updateManager.checkUpdate()
                }

                Box(modifier = Modifier.fillMaxSize()) {
                    AppNavHost()

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

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        MerchantDeepLinkBus.publish(intent.data)
    }
}
