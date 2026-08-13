package com.tembus.courier.ui

// CI Retrigger: 2026-05-14T19:59


import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.util.Log
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import com.google.firebase.messaging.FirebaseMessaging
import com.tembus.courier.data.repository.FCMTokenRepository
import com.tembus.courier.data.repository.OrderRepository
import com.tembus.courier.data.session.AuthSessionManager
import com.tembus.courier.data.api.TEMBUSApiService
import com.tembus.courier.data.model.LoginRequest
import com.tembus.courier.service.LocationTrackerService
import com.tembus.courier.ui.screens.MainScreen
import com.tembus.courier.ui.screens.auth.LoginScreen
import com.tembus.courier.ui.theme.TEMBUSCourierTheme
import com.tembus.courier.ui.components.UpdateDialog
import com.tembus.courier.data.model.AppVersion
import com.tembus.courier.util.FirebaseInitializer
import com.tembus.courier.util.UpdateManager
import com.tembus.courier.BuildConfig


import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import android.os.PowerManager
import android.content.Context
import javax.inject.Inject

/**
 * Main Activity for TEMBUS Courier App
 *
 * Entry point that:
 * 1. Checks if courier is logged in → shows LoginScreen or MainScreen
 * 2. Handles runtime permissions (notifications, location)
 * 3. Registers FCM token with backend
 * 4. Triggers background sync of pending orders on startup
 */
@AndroidEntryPoint
class MainActivity : FragmentActivity() {

    private val activityScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    
    @Inject
    lateinit var fcmTokenRepository: FCMTokenRepository
    
    @Inject
    lateinit var orderRepository: OrderRepository
    
    @Inject
    lateinit var authSessionManager: AuthSessionManager

    @Inject
    lateinit var apiService: TEMBUSApiService

    @Inject
    lateinit var updateManager: UpdateManager
    // Reactive state flows for deterministic notification deep-linking
    private val selectedOrderIdFlow = MutableStateFlow<String?>(null)
    private val selectedChatOrderIdFlow = MutableStateFlow<String?>(null)

    private val requestPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted: Boolean ->
        Log.d("FCM_NOTIFY", if (isGranted) "Notification permission granted" else "Notification permission denied")
        obtainAndRegisterFCMToken()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Ingest startup deep-links
        processIntentExtras(intent)

        // ---- DEBUG-ONLY UAT harness (BuildConfig.DEBUG) ----
        if (BuildConfig.DEBUG) {
            handleDebugUatDeepLink()
        }
        // ---- END DEBUG-ONLY ----

        // 🎨 VISUAL ELEVATION: Enable transparent edge-to-edge Canvas
        enableEdgeToEdge()

        setContent {
            TEMBUSCourierTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    // Auth gate — observe login state reactively
                    val isLoggedIn by authSessionManager.isLoggedIn.collectAsState(initial = false)
                    
                    // Collect active deep links reactively
                    val deepLinkOrderId by selectedOrderIdFlow.collectAsState()
                    val deepLinkChatOrderId by selectedChatOrderIdFlow.collectAsState()

                    // 📱 SYSTEM: App Update Logic
                    var updateInfo by remember { mutableStateOf<AppVersion?>(null) }
                    var isUpdating by remember { mutableStateOf(false) }
                    var updateError by remember { mutableStateOf<String?>(null) }
                    LaunchedEffect(Unit) {
                        updateInfo = updateManager.checkUpdate()
                    }

                    updateInfo?.takeIf { info -> info.force || isLoggedIn }?.let { info ->
                        UpdateDialog(
                            version = info,
                            isUpdating = isUpdating,
                            errorMessage = updateError,
                            onUpdateNow = {
                                updateError = null
                                isUpdating = true
                                activityScope.launch {
                                    val result = updateManager.downloadAndOpenInstaller(info)
                                    isUpdating = false
                                    result.onFailure { error ->
                                        if (error is UpdateManager.InstallPermissionRequiredException) {
                                            updateError = "Aktifkan izin install update untuk TEMBUS Mitra Kurir, lalu tekan Update sekarang lagi."
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

                    if (isLoggedIn) {

                        MainScreen(
                            initialOrderId = deepLinkOrderId,
                            initialChatOrderId = deepLinkChatOrderId,
                            authSessionManager = authSessionManager,
                            onConsumedDeepLink = {
                                selectedOrderIdFlow.value = null
                                selectedChatOrderIdFlow.value = null
                            },
                            onLogout = {
                                // After logout: clear FCM, stop location service
                                activityScope.launch {
                                    stopService(LocationTrackerService.stopIntent(this@MainActivity))
                                }
                            }
                        )
                    } else {
                        LoginScreen(
                            onLoginSuccess = {
                                askNotificationPermission()
                            }
                        )
                    }
                }
            }
        }
    }

    private fun askNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            when {
                ContextCompat.checkSelfPermission(
                    this,
                    Manifest.permission.POST_NOTIFICATIONS
                ) == PackageManager.PERMISSION_GRANTED -> {
                    obtainAndRegisterFCMToken()
                }
                else -> {
                    requestPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                }
            }
        } else {
            obtainAndRegisterFCMToken()
        }
    }

    /**
     * Start location tracking service — only if courier is currently logged in
     */
    private fun startLocationTrackingIfLoggedIn() {
        activityScope.launch {
            val isLoggedIn = authSessionManager.isLoggedIn.first()
            val isOnline = authSessionManager.isOnline.first()
            if (isLoggedIn && isOnline) {
                ContextCompat.startForegroundService(this@MainActivity, LocationTrackerService.startIntent(this@MainActivity))
                Log.d("LOCATION", "Location tracking service started with ContextCompat")
            } else {
                Log.d("LOCATION", "Location tracking not started. loggedIn=$isLoggedIn online=$isOnline")
            }
        }
    }

    /**
     * Obtain FCM token and register with backend + sync pending orders
     */
    private fun obtainAndRegisterFCMToken() {
        if (!FirebaseInitializer.initializeIfConfigured(this)) {
            Log.w("FCM_TOKEN", "Skipping FCM token registration because Firebase is not configured")
            return
        }

        FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
            if (task.isSuccessful) {
                Log.d("FCM_TOKEN", "Token obtained")
                activityScope.launch {
                    val result = fcmTokenRepository.registerTokenIfLoggedIn()
                    if (result.isSuccess) {
                        Log.d("FCM_TOKEN", "Token registered with backend")
                    } else {
                        val exc = result.exceptionOrNull()
                        if (exc != null && exc.message != "Session data unavailable") {
                            Log.e("FCM_TOKEN", "Registration failed: ${exc.message}")
                        }
                    }
                }
                // Sync pending orders on app startup
                activityScope.launch {
                    val isLoggedIn = authSessionManager.isLoggedIn.first()
                    if (isLoggedIn) {
                        val syncResult = orderRepository.syncPendingOrders()
                        if (syncResult.isSuccess) {
                            Log.d("ORDER_SYNC", "Synced ${syncResult.getOrNull()?.size ?: 0} pending orders")
                        } else {
                            Log.e("ORDER_SYNC", "Sync failed: ${syncResult.exceptionOrNull()?.message}")
                        }
                    }
                }
            } else {
                Log.w("FCM_TOKEN", "Fetching token failed", task.exception)
            }
        }
    }

    /**
     * Lifecycle Hook: Captures incoming deep links when the Activity resides in background memory
     */
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        processIntentExtras(intent)
    }

    override fun onResume() {
        super.onResume()
        // 🚨 Cold/Warm Boot Anti-Tamper Check
        val prefs = getSharedPreferences("sos_prefs", Context.MODE_PRIVATE)
        val isSosActive = prefs.getBoolean("is_sos_active", false)
        if (isSosActive) {
            val locationManager = getSystemService(Context.LOCATION_SERVICE) as android.location.LocationManager
            val isGpsEnabled = locationManager.isProviderEnabled(android.location.LocationManager.GPS_PROVIDER)
            val isNetworkEnabled = locationManager.isProviderEnabled(android.location.LocationManager.NETWORK_PROVIDER)

            val hasFineLocation = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
            val hasCoarseLocation = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
            
            if (!(isGpsEnabled || isNetworkEnabled) || !(hasFineLocation || hasCoarseLocation)) {
                Log.e("MainActivity", "Cold/Warm Boot Tamper Detected! Launching Alert.")
                val tamperIntent = Intent(this, TamperAlertActivity::class.java).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                }
                startActivity(tamperIntent)
            }
        }
    }

    private fun processIntentExtras(intent: Intent?) {
        val orderId = intent?.getStringExtra("selected_order_id")
        val chatOrderId = intent?.getStringExtra("chat_order_id")
        
        if (orderId != null) {
            Log.d("DEEP_LINK", "Order Deep Link Captured: $orderId")
            selectedOrderIdFlow.value = orderId
        }
        
        if (chatOrderId != null) {
            Log.d("DEEP_LINK", "Chat Deep Link Captured: $chatOrderId")
            selectedChatOrderIdFlow.value = chatOrderId
        }
    }

    /**
     * Whitelist Prompt: Instructs OS OEM Battery Optimizations to exclude our GPS services
     */
    fun checkAndRequestBatteryWhitelist() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
            val pkgName = packageName
            if (!powerManager.isIgnoringBatteryOptimizations(pkgName)) {
                try {
                    val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                        data = Uri.parse("package:$pkgName")
                    }
                    startActivity(intent)
                    Log.d("BATTERY", "Requesting ignore battery optimizations")
                } catch (e: Exception) {
                    Log.e("BATTERY", "Failed to trigger request intent: ${e.message}")
                    // General fallback to battery settings
                    try {
                        val fallbackIntent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
                        startActivity(fallbackIntent)
                    } catch (ex: Exception) {
                        Log.e("BATTERY", "Absolute fallback failed: ${ex.message}")
                    }
                }
            }
        }
    }

    // ---- DEBUG-ONLY UAT harness (BuildConfig.DEBUG) ----
    private fun handleDebugUatDeepLink() {
        val uri = intent?.data ?: return
        if (uri.scheme != "tembus" || uri.host != "debug") return
        val orderId = uri.lastPathSegment ?: return
        if (!orderId.matches(Regex("^[a-zA-Z0-9-]+$"))) return

        activityScope.launch {
            runCatching {
                val resp = apiService.login(
                    LoginRequest(
                        username = "raka.pickup@tembus.id",
                        password = "kurir123",
                        deviceId = "android:emu-uat",
                        deviceInfo = emptyMap()
                    )
                )
                val body = resp.body()
                val data = body?.data
                val token = data?.token
                val cid = data?.courierId
                if (!token.isNullOrBlank() && !cid.isNullOrBlank()) {
                    authSessionManager.saveSession(token, cid, data?.name ?: "")
                    selectedChatOrderIdFlow.value = orderId
                } else {
                    Log.e("MainActivity", "UAT debug login: empty token/cid")
                }
            }.onFailure { e ->
                Log.e("MainActivity", "UAT debug login error: ${e.message}")
            }
        }
    }
    // ---- END DEBUG-ONLY ----
}
