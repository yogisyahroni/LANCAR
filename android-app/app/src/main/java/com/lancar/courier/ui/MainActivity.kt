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
import androidx.compose.ui.Modifier
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessaging
import com.lancar.courier.LANCARApplication
import com.lancar.courier.data.repository.OrderRepository
import com.lancar.courier.data.session.AuthSessionManager
import com.lancar.courier.service.LocationTrackerService
import com.lancar.courier.ui.screens.MainScreen
import com.lancar.courier.ui.theme.LANCARCourierTheme
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Main Activity for LANCAR Courier App
 * 
 * Entry point that sets up Compose UI, handles notification permission,
 * registers FCM token with backend, and initializes offline order queue.
 */
class MainActivity : ComponentActivity() {

    private val activityScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private lateinit var fcmTokenRepository: FCMTokenRepository
    private lateinit var orderRepository: OrderRepository

    private val requestPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted: Boolean ->
        if (isGranted) {
            Log.d("FCM_NOTIFY", "Notification permission granted")
        } else {
            Log.d("FCM_NOTIFY", "Notification permission denied")
        }
        // Always obtain and register token regardless of permission result
        obtainAndRegisterFCMToken()
    }

    private val requestLocationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted: Boolean ->
        if (isGranted) {
            Log.d("LOCATION", "Location permission granted")
            startLocationTracking()
        } else {
            Log.d("LOCATION", "Location permission denied")
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Initialize repositories
        fcmTokenRepository = FCMTokenRepository(applicationContext)
        orderRepository = OrderRepository(applicationContext)
        
        // Initialize OrderRepository in Application (alternative approach)
        // LANCARApplication.OrderModule.init(applicationContext)
        
        // Request notification permission for Android 13+
        askNotificationPermission()
        
        // Request location permission for GPS tracking (PTLAAA-46)
        askLocationPermission()

        setContent {
            LANCARCourierTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    MainScreen()
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
                    // Permission already granted
                    obtainAndRegisterFCMToken()
                }
                shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS) -> {
                    // Show rationale if needed, then request
                    requestPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                }
                else -> {
                    // Request permission
                    requestPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                }
            }
        } else {
            // No runtime permission needed on older Android versions
            obtainAndRegisterFCMToken()
        }
    }

    private fun askLocationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            // Check for background location permission (Android 10+)
            when {
                ContextCompat.checkSelfPermission(
                    this,
                    Manifest.permission.ACCESS_FINE_LOCATION
                ) == PackageManager.PERMISSION_GRANTED -> {
                    // Fine location permission granted
                    if (ContextCompat.checkSelfPermission(
                            this,
                            Manifest.permission.ACCESS_BACKGROUND_LOCATION
                        ) == PackageManager.PERMISSION_GRANTED
                    ) {
                        // Background location permission also granted
                        startLocationTracking()
                    } else {
                        // Request background location permission
                        requestLocationPermissionLauncher.launch(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
                    }
                }
                shouldShowRequestPermissionRationale(Manifest.permission.ACCESS_FINE_LOCATION) -> {
                    // Show rationale if needed, then request
                    requestLocationPermissionLauncher.launch(Manifest.permission.ACCESS_FINE_LOCATION)
                }
                else -> {
                    // Request fine location permission
                    requestLocationPermissionLauncher.launch(Manifest.permission.ACCESS_FINE_LOCATION)
                }
            }
        } else {
            // No runtime permission needed on older Android versions
            if (ContextCompat.checkSelfPermission(
                    this,
                    Manifest.permission.ACCESS_FINE_LOCATION
                ) == PackageManager.PERMISSION_GRANTED
            ) {
                startLocationTracking()
            }
        }
    }

    /**
     * Start location tracking service
     */
    private fun startLocationTracking() {
        val authSessionManager = AuthSessionManager(applicationContext)
        activityScope.launch {
            val isLoggedIn = authSessionManager.isLoggedIn.first()
            if (isLoggedIn) {
                startService(LocationTrackerService.startIntent(this@MainActivity))
                Log.d("LOCATION", "Location tracking service started")
            }
        }
    }

    /**
     * Obtain FCM token and register with backend if courier is logged in
     */
    private fun obtainAndRegisterFCMToken() {
        FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
            if (task.isSuccessful) {
                val token = task.result
                Log.d("FCM_TOKEN", "Token: $token")
                // Register token with backend (only if courier is logged in)
                activityScope.launch {
                    val result = fcmTokenRepository.registerTokenIfLoggedIn()
                    if (result.isSuccess) {
                        Log.d("FCM_TOKEN", "Token registered with backend")
                    } else {
                        // Not logged in is expected, only log actual errors
                        val exc = result.exceptionOrNull()
                        if (exc != null && exc.message != "Session data unavailable") {
                            Log.e("FCM_TOKEN", "Registration failed: ${exc.message}")
                        }
                    }
                }
            } else {
                Log.w("FCM_TOKEN", "Fetching token failed", task.exception)
            }
        }
        
        // Also sync any pending orders on startup
        activityScope.launch {
            val isLoggedIn = AuthSessionManager(applicationContext).isLoggedIn.first()
            if (isLoggedIn) {
                val session = AuthSessionManager(applicationContext).getSession()
                if (session != null) {
                    val syncResult = orderRepository.syncPendingOrders(session.authToken)
                    if (syncResult.isSuccess) {
                        Log.d("ORDER_SYNC", "Synced ${syncResult.getOrNull()?.size ?: 0} pending orders")
                    } else {
                        Log.e("ORDER_SYNC", "Failed to sync orders: ${syncResult.exceptionOrNull()?.message}")
                    }
                }
            }
        }
    }
}
