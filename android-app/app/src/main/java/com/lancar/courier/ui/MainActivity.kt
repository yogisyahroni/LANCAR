package com.lancar.courier.ui

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessaging
import com.lancar.courier.data.repository.OrderRepository
import com.lancar.courier.data.session.AuthSessionManager
import com.lancar.courier.service.LocationTrackerService
import com.lancar.courier.ui.screens.MainScreen
import com.lancar.courier.ui.screens.auth.LoginScreen
import com.lancar.courier.ui.theme.LANCARCourierTheme
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

/**
 * Main Activity for LANCAR Courier App
 *
 * Entry point that:
 * 1. Checks if courier is logged in → shows LoginScreen or MainScreen
 * 2. Handles runtime permissions (notifications, location)
 * 3. Registers FCM token with backend
 * 4. Triggers background sync of pending orders on startup
 */
class MainActivity : ComponentActivity() {

    private val activityScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private lateinit var fcmTokenRepository: FCMTokenRepository
    private lateinit var orderRepository: OrderRepository
    private lateinit var authSessionManager: AuthSessionManager

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
            Log.d("LOCATION", "Location permission granted")
            startLocationTrackingIfLoggedIn()
        } else {
            Log.d("LOCATION", "Location permission denied")
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        authSessionManager = AuthSessionManager(applicationContext)
        fcmTokenRepository = FCMTokenRepository(applicationContext)
        orderRepository = OrderRepository(applicationContext)

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
                    val orderId = intent?.getStringExtra("selected_order_id")

                    if (isLoggedIn) {
                        MainScreen(
                            initialOrderId = orderId,
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
                startService(LocationTrackerService.startIntent(this@MainActivity))
                Log.d("LOCATION", "Location tracking service started")
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
}
