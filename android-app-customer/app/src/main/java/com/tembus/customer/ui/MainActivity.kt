package com.tembus.customer.ui

// CI Retrigger: 2026-05-14T19:59

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.SystemClock
import android.widget.Toast
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.lifecycleScope
import com.tembus.customer.BuildConfig
import com.tembus.customer.data.model.AppVersion
import com.tembus.customer.ui.components.UpdateDialog
import com.tembus.customer.ui.theme.TEMBUSCustomerTheme
import com.tembus.customer.util.UpdateManager
import dagger.Lazy
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import androidx.activity.viewModels
import com.tembus.customer.ui.MainViewModel

@AndroidEntryPoint
class MainActivity : FragmentActivity() {

    @Inject
    lateinit var updateManager: UpdateManager

    @Inject
    lateinit var authRepository: com.tembus.customer.data.repository.AuthRepository

    @Inject
    lateinit var authSessionManager: Lazy<com.tembus.customer.data.session.AuthSessionManager>

    private var pendingDeepLinkUri by mutableStateOf<Uri?>(null)

    private val viewModel: MainViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        val splashScreen = installSplashScreen()
        val splashStartedAt = SystemClock.elapsedRealtime()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        splashScreen.setKeepOnScreenCondition {
            SystemClock.elapsedRealtime() - splashStartedAt < 1_000L
        }

        // ---- DEBUG-ONLY UAT harness (BuildConfig.DEBUG) ----
        // Deep link: tembus://debug/uat/chat/{orderId}
        // Auto-login with test credentials, then route into the food chat screen.
        if (BuildConfig.DEBUG) {
            handleDebugUatDeepLink()
        }
        // ---- END DEBUG-ONLY ----

        pendingDeepLinkUri = intent?.data

        // SECURITY: Validate deep link data before any processing
        intent?.data?.let { uri ->
            validateDeepLinkOrFinish(uri)
        }

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
                    // App update logic runs immediately since we no longer have a custom splash
                    var updateInfo by remember { mutableStateOf<AppVersion?>(null) }
                    var isUpdating by remember { mutableStateOf(false) }
                    var updateError by remember { mutableStateOf<String?>(null) }
                    val updateScope = rememberCoroutineScope()
                    
                    LaunchedEffect(Unit) {
                        updateInfo = updateManager.checkUpdate()
                    }

                    Box(modifier = Modifier.fillMaxSize()) {
                        com.tembus.customer.ui.navigation.RootNavGraph(
                            initialDeepLink = pendingDeepLinkUri,
                            onDeepLinkConsumed = { pendingDeepLinkUri = null }
                        )
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
        pendingDeepLinkUri = intent.data
        intent.data?.let { uri ->
            validateDeepLinkOrFinish(uri)
        }
    }

    private fun handleDebugUatDeepLink() {
        val uri = intent?.data ?: return
        if (uri.scheme != "tembus" || uri.host != "debug") return
        val orderId = uri.lastPathSegment ?: return
        if (!orderId.matches(Regex("^[a-zA-Z0-9-]+$"))) return

        lifecycleScope.launch {
            val result = runCatching {
                authRepository.startPasswordLogin(
                    email = "customer@tembus.id",
                    password = "Customer123!"
                )
            }.getOrElse { e ->
                android.util.Log.e("MainActivity", "UAT debug login failed: ${e.message}")
                return@launch
            }
            result.onSuccess { resp ->
                val token = resp.data?.token ?: resp.accessToken
                val cid = resp.data?.customerId ?: resp.user?.id
                if (!token.isNullOrBlank() && !cid.isNullOrBlank()) {
                    authSessionManager.get().saveSessionSync(token, cid, resp.data?.name ?: resp.user?.name)
                    if (orderId == "home") {
                        // Debug-only: route straight to Dashboard after auto-login (skip chat).
                        pendingDeepLinkUri = null
                        val homeIntent = Intent(this@MainActivity, MainActivity::class.java).apply {
                            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
                        }
                        startActivity(homeIntent)
                    } else {
                        // Rewrite deep link to the real chat route
                        pendingDeepLinkUri = Uri.parse("tembus://orders/$orderId/chat")
                        val chatIntent = Intent(this@MainActivity, MainActivity::class.java).apply {
                            data = Uri.parse("tembus://orders/$orderId/chat")
                            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
                        }
                        startActivity(chatIntent)
                    }
                } else {
                    android.util.Log.e("MainActivity", "UAT debug login: empty token/cid (requireOtp=${resp.requireOtp})")
                }
            }.onFailure { e ->
                android.util.Log.e("MainActivity", "UAT debug login error: ${e.message}")
            }
        }
    }

    private fun validateDeepLinkOrFinish(uri: Uri) {
        val pathSegments = uri.pathSegments
        val validHost = when (uri.host) {
            "orders" -> pathSegments.size in 1..2 && (pathSegments.size == 1 || pathSegments[1] in setOf("chat", "tracking"))
            "booking" -> pathSegments.isEmpty()
            "debug" -> BuildConfig.DEBUG && pathSegments.size >= 3 && pathSegments[0] == "uat" && pathSegments[1] == "chat"
            else -> false
        }
        if (uri.scheme != "tembus" || !validHost) {
            Toast.makeText(this, "Link tidak valid", Toast.LENGTH_SHORT).show()
            finish()
            return
        }

        val orderId = uri.getQueryParameter("id") ?: pathSegments.firstOrNull()
        // Only allow alphanumeric + hyphen in order IDs (UUID format)
        if (orderId != null && !orderId.matches(Regex("^[a-zA-Z0-9-]+$"))) {
            Toast.makeText(this, "Link tidak valid", Toast.LENGTH_SHORT).show()
            finish()
            return
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
