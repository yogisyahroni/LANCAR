package com.lancar.courier.service

import android.app.*
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.location.Location
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.BatteryManager
import android.os.Build
import android.os.IBinder
import android.provider.Settings
import android.util.Log
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import com.google.android.gms.location.*
import com.lancar.courier.R
import com.lancar.courier.data.model.Location as LocationModel
import com.lancar.courier.data.repository.LocationRepository
import com.lancar.courier.data.session.AuthSessionManager
import com.lancar.courier.ui.MainActivity
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.first
import java.util.concurrent.TimeUnit
import javax.inject.Inject

/**
 * Location Tracker Service
 * 
 * Foreground service for real-time background GPS tracking.
 * Collects location updates and sends them to the backend.
 * 
 * Features:
 * - Foreground service with persistent notification
 * - Battery-optimized location updates
 * - Background fetch with activity recognition
 * - Automatic sync to backend
 */
@AndroidEntryPoint
class LocationTrackerService : Service() {

    private val TAG = "LocationTrackerService"
    private val MAIN_THREAD = MainScope()
    private val IO_THREAD = CoroutineScope(Dispatchers.IO + SupervisorJob())

    // Location tracking
    private var fusedLocationClient: FusedLocationProviderClient? = null
    private var locationCallback: LocationCallback? = null
    private var locationRequest: LocationRequest? = null

    // State
    private var isTracking = false
    private var courierId: String? = null
    private var deviceId: String? = null

    // Repository
    @Inject
    lateinit var locationRepository: LocationRepository
    
    @Inject
    lateinit var authSessionManager: AuthSessionManager

    // Update interval (configurable)
    private val UPDATE_INTERVAL_MS = TimeUnit.MINUTES.toMillis(1) // 1 minute
    private val FASTEST_UPDATE_INTERVAL_MS = TimeUnit.SECONDS.toMillis(30) // 30 seconds
    private val MAX_WAIT_TIME_MS = TimeUnit.MINUTES.toMillis(2) // 2 minutes

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "Service created")

        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this)

        // Get device ID (use installation ID or generate once)
        deviceId = getUniqueDeviceId()

        // Start tracking if courier is logged in
        checkAndStartTracking()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(TAG, "Service started")

        if (intent != null) {
            when (intent.action) {
                ACTION_START_TRACKING -> {
                    startTracking()
                }
                ACTION_STOP_TRACKING -> {
                    stopTracking()
                }
                ACTION_FORCE_SYNC -> {
                    forceSync()
                }
            }
        }

        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        Log.d(TAG, "Service destroyed")
        stopTracking()
        MAIN_THREAD.cancel()
        IO_THREAD.cancel()
    }

    /**
     * Check if courier is logged in and start tracking
     */
    private fun checkAndStartTracking() {
        MAIN_THREAD.launch {
            authSessionManager.isLoggedIn.collect { isLoggedIn ->
                if (isLoggedIn) {
                    val session = authSessionManager.getSession()
                    if (session != null) {
                        courierId = session.courierId
                        if (!isTracking) {
                            startTracking()
                        }
                    }
                } else {
                    if (isTracking) {
                        stopTracking()
                    }
                }
            }
        }
    }

    /**
     * Start location tracking
     */
    private fun startTracking() {
        if (isTracking) {
            Log.d(TAG, "Already tracking")
            return
        }

        if (courierId == null) {
            Log.w(TAG, "Courier ID not available")
            return
        }

        // Create notification channel and start foreground
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, createNotification())

        // Build location request
        val request = LocationRequest.Builder(
            Priority.PRIORITY_BALANCED_POWER_ACCURACY,
            UPDATE_INTERVAL_MS
        ).apply {
            setMinUpdateIntervalMillis(FASTEST_UPDATE_INTERVAL_MS)
            setMaxUpdateDelayMillis(MAX_WAIT_TIME_MS)
            setMinUpdateDistanceMeters(50f) // 50 meters
        }.build()
        
        locationRequest = request

        // Set up location callback
        val callback = object : LocationCallback() {
            override fun onLocationResult(locationResult: LocationResult) {
                super.onLocationResult(locationResult)
                locationResult.lastLocation?.let { location ->
                    handleLocationUpdate(location)
                }
            }
        }
        
        locationCallback = callback

        // Request location updates
        if (ActivityCompat.checkSelfPermission(
                this,
                android.Manifest.permission.ACCESS_FINE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED &&
            ActivityCompat.checkSelfPermission(
                this,
                android.Manifest.permission.ACCESS_COARSE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED
        ) {
            val req = locationRequest
            val cb = locationCallback
            if (req != null && cb != null) {
                fusedLocationClient?.requestLocationUpdates(
                    req,
                    cb,
                    android.os.Looper.getMainLooper()
                )
                isTracking = true
                Log.d(TAG, "Location tracking started")
            }
        } else {
            Log.w(TAG, "Location permissions not granted")
            stopSelf()
        }
    }

    /**
     * Stop location tracking
     */
    private fun stopTracking() {
        if (!isTracking) {
            return
        }

        // Remove location updates
        locationCallback?.let { cb ->
            fusedLocationClient?.removeLocationUpdates(cb)
        }
        locationCallback = null
        locationRequest = null

        // Stop foreground service
        stopForeground(STOP_FOREGROUND_REMOVE)
        isTracking = false
        Log.d(TAG, "Location tracking stopped")
    }

    /**
     * Handle location update
     */
    private fun handleLocationUpdate(location: Location) {
        val batteryLevel = getBatteryLevel()
        val networkType = getNetworkType()

        val locationModel = LocationModel(
            latitude = location.latitude,
            longitude = location.longitude,
            accuracy = location.accuracy,
            speed = location.speed.takeIf { it > 0 } ?: 0f,
            bearing = location.bearing.takeIf { it > 0 } ?: 0f,
            altitude = location.altitude.takeIf { it > 0 } ?: 0.0,
            timestamp = location.time,
            courierId = courierId ?: "",
            deviceId = deviceId ?: "",
            batteryLevel = batteryLevel,
            networkType = networkType
        )

        // Save to local database
        IO_THREAD.launch {
            locationRepository.insertLocation(locationModel)
            Log.d(TAG, "Location saved: ${location.latitude}, ${location.longitude}")
        }

        // Try to sync if we have enough unsynced locations
        IO_THREAD.launch {
            val unsyncedCount = locationRepository.getUnsyncedCount().first()
            if (unsyncedCount >= 10) {
                syncLocations()
            }
        }
    }

    /**
     * Sync locations to backend
     */
    private fun syncLocations() {
        MAIN_THREAD.launch {
            authSessionManager.getSession()?.let { session ->
                IO_THREAD.launch {
                    val result = locationRepository.syncLocations(
                        session.authToken,
                        session.courierId,
                        deviceId ?: ""
                    )

                    result.onSuccess { syncedIds ->
                        Log.d(TAG, "Synced ${syncedIds.size} locations")
                    }.onFailure { e ->
                        Log.e(TAG, "Sync failed: ${e.message}")
                    }
                }
            }
        }
    }

    /**
     * Force sync all pending locations
     */
    private fun forceSync() {
        MAIN_THREAD.launch {
            authSessionManager.getSession()?.let { session ->
                IO_THREAD.launch {
                    val result = locationRepository.syncLocations(
                        session.authToken,
                        session.courierId,
                        deviceId ?: ""
                    )

                    result.onSuccess { syncedIds ->
                        Log.d(TAG, "Force synced ${syncedIds.size} locations")
                    }.onFailure { e ->
                        Log.e(TAG, "Force sync failed: ${e.message}")
                    }
                }
            }
        }
    }

    /**
     * Get battery level
     */
    private fun getBatteryLevel(): Int {
        val batteryIntent = registerReceiver(
            null,
            IntentFilter(Intent.ACTION_BATTERY_CHANGED)
        )
        return batteryIntent?.getIntExtra(android.os.BatteryManager.EXTRA_LEVEL, -1) ?: 100
    }

    /**
     * Get network type
     */
    private fun getNetworkType(): String {
        val connectivityManager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = connectivityManager.activeNetwork ?: return "NONE"
        val capabilities = connectivityManager.getNetworkCapabilities(network) ?: return "NONE"
        return when {
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "WIFI"
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "MOBILE"
            else -> "OTHER"
        }
    }

    /**
     * Get unique device ID
     */
    private fun getUniqueDeviceId(): String {
        // Secure.ANDROID_ID is unique per app signing key and user.
        return Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID) ?: "unknown_device"
    }

    /**
     * Create notification channel
     */
    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_LOCATION_TRACKING,
                "Location Tracking",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Real-time courier location tracking"
                setShowBadge(false)
            }

            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)
        }
    }

    /**
     * Create notification for foreground service
     */
    private fun createNotification(): Notification {
        val notificationIntent = Intent(this, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            notificationIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        return NotificationCompat.Builder(this, CHANNEL_LOCATION_TRACKING)
            .setContentTitle("LANCAR Courier")
            .setContentText("Tracking your location for real-time shipment updates")
            .setSmallIcon(R.drawable.ic_notification)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    companion object {
        const val CHANNEL_LOCATION_TRACKING = "location_tracking"
        const val NOTIFICATION_ID = 1001

        const val ACTION_START_TRACKING = "com.lancar.courier.ACTION_START_TRACKING"
        const val ACTION_STOP_TRACKING = "com.lancar.courier.ACTION_STOP_TRACKING"
        const val ACTION_FORCE_SYNC = "com.lancar.courier.ACTION_FORCE_SYNC"

        fun startIntent(context: Context): Intent =
            Intent(context, LocationTrackerService::class.java).apply {
                action = ACTION_START_TRACKING
            }

        fun stopIntent(context: Context): Intent =
            Intent(context, LocationTrackerService::class.java).apply {
                action = ACTION_STOP_TRACKING
            }

        fun forceSyncIntent(context: Context): Intent =
            Intent(context, LocationTrackerService::class.java).apply {
                action = ACTION_FORCE_SYNC
            }
    }
}
