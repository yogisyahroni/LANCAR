package com.lancar.courier.ui

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessaging
import com.lancar.courier.data.repository.FCMTokenRepository
import com.lancar.courier.data.repository.OrderRepository
import com.lancar.courier.data.session.AuthSessionManager
import com.lancar.courier.service.LocationTrackerService
import com.lancar.courier.ui.screens.MainScreen
import com.lancar.courier.ui.screens.auth.LoginScreen
import com.lancar.courier.ui.theme.LANCARCourierTheme
import com.lancar.courier.ui.components.UpdateDialog
import com.lancar.courier.data.model.AppVersion
import com.lancar.courier.util.UpdateManager


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
 * Main Activity for LANCAR Courier App
 *
 * Entry point that:
 * 1. Checks if courier is logged in → shows LoginScreen or MainScreen
 * 2. Handles runtime permissions (notifications, location)
 * 3. Registers FCM token with backend
 * 4. Triggers background sync of pending orders on startup
 */
@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    private val activityScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    
    @Inject
    lateinit var fcmTokenRepository: FCMTokenRepository
    
    @Inject
    lateinit var orderRepository: OrderRepository
    
    @Inject
    lateinit var authSessionManager: AuthSessionManager
    
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

    private val requestLocationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted: Boolean ->
        if (isGranted) {
            Log.d("LOCATION", "Permission step granted - triggering sequential escalation check")
            // Recurse to process next item in the permissions hierarchy (e.g., Foreground -> Background)
            askLocationPermission()
        } else {
            Log.d("LOCATION", "Permission step denied")
            // Fallback: attempt tracking anyway with whatever permissions exist
            startLocationTrackingIfLoggedIn()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Ingest startup deep-links
        processIntentExtras(intent)

        // 🎨 VISUAL ELEVATION: Enable transparent edge-to-edge Canvas
        enableEdgeToEdge()

        askNotificationPermission()
        askLocationPermission()

        setContent {
            LANCARCourierTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    // Auth gate — observe login state reactively
                    val isLoggedIn by authSessionManager.isLoggedIn.collectAsState(initial = false)
                    
                    // 🔋 SECURITY ENHANCEMENT: Trigger OS Battery Optimization Whitelisting on active duty session to protect background GPS
                    LaunchedEffect(isLoggedIn) {
                        if (isLoggedIn) {
                            checkAndRequestBatteryWhitelist()
                        }
                    }
                    
                    // Collect active deep links reactively
                    val deepLinkOrderId by selectedOrderIdFlow.collectAsState()
                    val deepLinkChatOrderId by selectedChatOrderIdFlow.collectAsState()

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

                    if (isLoggedIn) {

                        MainScreen(
                            initialOrderId = deepLinkOrderId,
                            initialChatOrderId = deepLinkChatOrderId,
                            onConsumedDeepLink = {
                                selectedOrderIdFlow.value = null
                                selectedChatOrderIdFlow.value = null
                            },
                            onLogout = {
                                // After logout: clear FCM, stop location service
                                activityScope.launch {
                                    stopService(LocationTrackerService.startIntent(this@MainActivity))
                                }
                            }
                        )
                    } else {
                        LoginScreen(
                            onLoginSuccess = {
                                // After login: register FCM token + start location
                                obtainAndRegisterFCMToken()
                                startLocationTrackingIfLoggedIn()
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

    private fun askLocationPermission() {
        when {
            ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.ACCESS_FINE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED -> {
                // Check background location on Android 10+
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
                    ContextCompat.checkSelfPermission(
                        this,
                        Manifest.permission.ACCESS_BACKGROUND_LOCATION
                    ) != PackageManager.PERMISSION_GRANTED
                ) {
                    requestLocationPermissionLauncher.launch(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
                } else {
                    startLocationTrackingIfLoggedIn()
                }
            }
            else -> {
                requestLocationPermissionLauncher.launch(Manifest.permission.ACCESS_FINE_LOCATION)
            }
        }
    }

    /**
     * Start location tracking service — only if courier is currently logged in
     */
    private fun startLocationTrackingIfLoggedIn() {
        activityScope.launch {
            val isLoggedIn = authSessionManager.isLoggedIn.first()
            if (isLoggedIn) {
                ContextCompat.startForegroundService(this@MainActivity, LocationTrackerService.startIntent(this@MainActivity))
                Log.d("LOCATION", "Location tracking service started with ContextCompat")
            }
        }
    }

    /**
     * Obtain FCM token and register with backend + sync pending orders
     */
    private fun obtainAndRegisterFCMToken() {
        FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
            if (task.isSuccessful) {
                val token = task.result
                Log.d("FCM_TOKEN", "Token obtained: $token")
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
}
