package com.tembus.courier.service

import android.app.*
import android.content.BroadcastReceiver
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
import com.tembus.courier.BuildConfig
import com.google.android.gms.location.*
import com.tembus.courier.R
import com.tembus.courier.data.model.Location as LocationModel
import com.tembus.courier.data.repository.LocationRepository
import com.tembus.courier.data.session.AuthSessionManager
import com.tembus.courier.ui.MainActivity
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.combine
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
    private var isForeground = false
    private var courierId: String? = null
    private var deviceId: String? = null

    // Repository
    @Inject
    lateinit var locationRepository: LocationRepository
    
    @Inject
    lateinit var authSessionManager: AuthSessionManager

    // 🔋 Battery-Adaptive Configurable GPS Intervals
    private val NORMAL_INTERVAL_MS = TimeUnit.MINUTES.toMillis(1) // 1 minute
    private val NORMAL_FASTEST_INTERVAL_MS = TimeUnit.SECONDS.toMillis(30) // 30 seconds

    private val POWER_SAVER_INTERVAL_MS = TimeUnit.MINUTES.toMillis(5) // 5 minutes
    private val POWER_SAVER_FASTEST_INTERVAL_MS = TimeUnit.MINUTES.toMillis(2) // 2 minutes

    private var currentIntervalMode = IntervalMode.NORMAL
    private var isBatteryReceiverRegistered = false

    enum class IntervalMode {
        NORMAL,
        POWER_SAVER
    }

    private val batteryReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            intent?.let {
                val level = it.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
                val scale = it.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
                val batteryPct = if (scale > 0) (level * 100 / scale.toFloat()).toInt() else -1
                
                val status = it.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
                val isCharging = status == BatteryManager.BATTERY_STATUS_CHARGING || 
                                 status == BatteryManager.BATTERY_STATUS_FULL

                handleBatteryChanged(batteryPct, isCharging)
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        debugLog("Service created")

        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this)

        // Get device ID (use installation ID or generate once)
        deviceId = getUniqueDeviceId()

        // Start tracking if courier is logged in AND online
        checkAndStartTracking()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        debugLog("Service started")

        if (intent != null) {
            when (intent.action) {
                ACTION_START_TRACKING -> {
                    startTrackingFromCommand(startId)
                }
                ACTION_STOP_TRACKING -> {
                    stopTracking()
                    stopSelf(startId)
                }
                ACTION_FORCE_SYNC -> {
                    forceSync()
                }
                ACTION_GO_OFFLINE -> {
                    goOffline()
                }
            }
        }

        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        debugLog("Service destroyed")
        stopTracking()
        MAIN_THREAD.cancel()
        IO_THREAD.cancel()
    }

    /**
     * Set courier status to offline directly from background service
     */
    private fun goOffline() {
        MAIN_THREAD.launch {
            authSessionManager.setOnlineStatus(false)
            debugLog("Courier duty status set to OFFLINE via notification action")
        }
    }

    /**
     * Combine login status and online duty cycle to start/stop tracking re-actively
     */
    private fun checkAndStartTracking() {
        MAIN_THREAD.launch {
            combine(
                authSessionManager.isLoggedIn,
                authSessionManager.isOnline
            ) { loggedIn, online ->
                loggedIn && online
            }.collect { shouldTrack ->
                debugLog("Tracking eligibility evaluated: $shouldTrack")
                if (shouldTrack) {
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
            debugLog("Already tracking")
            return
        }

        if (courierId == null) {
            warnLog("Courier ID not available")
            return
        }

        promoteToForeground()

        // Build location request and start FusedLocation
        bindLocationUpdates()

        // Monitor battery life to trigger dynamic interval throttling
        registerBatteryReceiver()
        
        isTracking = true
        debugLog("Location tracking started")
    }

    /**
     * Foreground-service entrypoint must either call startForeground quickly or stop itself.
     * This keeps Android from killing the process when tracking is requested while Off Duty.
     */
    private fun startTrackingFromCommand(startId: Int) {
        promoteToForeground()

        MAIN_THREAD.launch {
            val session = authSessionManager.getSession()
            val isOnline = authSessionManager.isOnline.first()

            if (session == null || !isOnline) {
                warnLog("Start tracking ignored because session or duty state is unavailable")
                stopForegroundIfNeeded()
                stopSelf(startId)
                return@launch
            }

            courierId = session.courierId
            startTracking()
        }
    }

    private fun promoteToForeground() {
        if (isForeground) return

        createNotificationChannel()
        startForeground(NOTIFICATION_ID, createNotification())
        isForeground = true
    }

    private fun stopForegroundIfNeeded() {
        if (!isForeground) return

        stopForeground(STOP_FOREGROUND_REMOVE)
        isForeground = false
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

        // Unregister battery monitoring
        unregisterBatteryReceiver()

        // Stop foreground service
        stopForegroundIfNeeded()
        isTracking = false
        debugLog("Location tracking stopped")
    }

    /**
     * Handle location update
     */
    private fun handleLocationUpdate(location: Location) {
        val batteryLevel = getBatteryLevel()
        val networkType = getNetworkType()

        // 🛡️ INTEGRATE ANTI-FRAUD TELEMETRY
        val isMock = com.tembus.courier.util.SecurityUtils.isMockLocation(location)
        val isRooted = com.tembus.courier.util.SecurityUtils.isDeviceRooted(this)

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
            networkType = networkType,
            isMock = isMock,
            isRooted = isRooted
        )

        // Save to local database
        IO_THREAD.launch {
            locationRepository.insertLocation(locationModel)
            debugLog("Location sample saved locally")
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
                        session.courierId,
                        deviceId ?: ""
                    )

                    result.onSuccess { syncedIds ->
                        debugLog("Synced ${syncedIds.size} location samples")
                    }.onFailure { e ->
                        errorLog("Location sync failed", e)
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
                        session.courierId,
                        deviceId ?: ""
                    )

                    result.onSuccess { syncedIds ->
                        debugLog("Force synced ${syncedIds.size} location samples")
                    }.onFailure { e ->
                        errorLog("Force location sync failed", e)
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

        val offlineIntent = Intent(this, LocationTrackerService::class.java).apply {
            action = ACTION_GO_OFFLINE
        }
        val offlinePendingIntent = PendingIntent.getService(
            this,
            1,
            offlineIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        return NotificationCompat.Builder(this, CHANNEL_LOCATION_TRACKING)
            .setContentTitle("TEMBUS Courier")
            .setContentText("Tracking your location for real-time shipment updates")
            .setSmallIcon(R.drawable.ic_notification)
            .setContentIntent(pendingIntent)
            .addAction(
                R.drawable.ic_dismiss,
                "Go Offline",
                offlinePendingIntent
            )
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    /**
     * Configure and bind fused updates depending on current battery power saving configurations
     */
    private fun bindLocationUpdates() {
        val interval = if (currentIntervalMode == IntervalMode.POWER_SAVER) {
            POWER_SAVER_INTERVAL_MS
        } else {
            NORMAL_INTERVAL_MS
        }
        
        val fastestInterval = if (currentIntervalMode == IntervalMode.POWER_SAVER) {
            POWER_SAVER_FASTEST_INTERVAL_MS
        } else {
            NORMAL_FASTEST_INTERVAL_MS
        }

        val request = LocationRequest.Builder(
            Priority.PRIORITY_HIGH_ACCURACY,
            interval
        ).apply {
            setMinUpdateIntervalMillis(fastestInterval)
            setMaxUpdateDelayMillis(interval * 2)
            setMinUpdateDistanceMeters(50f) // 50 meters
        }.build()
        
        locationRequest = request

        val callback = object : LocationCallback() {
            override fun onLocationResult(locationResult: LocationResult) {
                super.onLocationResult(locationResult)
                locationResult.lastLocation?.let { location ->
                    val isMock = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                        location.isMock
                    } else {
                        @Suppress("DEPRECATION")
                        location.isFromMockProvider
                    }
                    
                    if (isMock) {
                        warnLog("Spoofed or mock GPS update dropped")
                        return@let
                    }
                    handleLocationUpdate(location)
                }
            }
        }
        
        locationCallback = callback

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
                debugLog("Fused location bound. Mode: $currentIntervalMode, Interval: ${interval / 1000}s")
            }
        }
    }

    /**
     * Reconstruct updates upon mode switch
     */
    private fun rebuildLocationRequest() {
        if (!isTracking) return
        
        locationCallback?.let { cb ->
            fusedLocationClient?.removeLocationUpdates(cb)
        }
        
        bindLocationUpdates()
        debugLog("GPS request dynamic rebuilt successfully")
    }

    private fun registerBatteryReceiver() {
        if (!isBatteryReceiverRegistered) {
            try {
                registerReceiver(batteryReceiver, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
                isBatteryReceiverRegistered = true
                debugLog("Battery monitor registered")
            } catch (e: Exception) {
                errorLog("Failed registering battery receiver", e)
            }
        }
    }

    private fun unregisterBatteryReceiver() {
        if (isBatteryReceiverRegistered) {
            try {
                unregisterReceiver(batteryReceiver)
                isBatteryReceiverRegistered = false
                debugLog("Battery monitor unregistered")
            } catch (e: Exception) {
                // Handle already unregistered gracefully
            }
        }
    }

    private fun handleBatteryChanged(pct: Int, isCharging: Boolean) {
        val targetMode = if (pct > 0 && pct < 20 && !isCharging) {
            IntervalMode.POWER_SAVER
        } else {
            IntervalMode.NORMAL
        }

        if (targetMode != currentIntervalMode) {
            currentIntervalMode = targetMode
            debugLog("Battery threshold changed location interval mode to $currentIntervalMode")
            rebuildLocationRequest()
        }
    }

    private fun debugLog(message: String) {
        if (BuildConfig.DEBUG) {
            Log.d(TAG, message)
        }
    }

    private fun warnLog(message: String) {
        Log.w(TAG, message)
    }

    private fun errorLog(message: String, throwable: Throwable? = null) {
        if (BuildConfig.DEBUG && throwable != null) {
            Log.e(TAG, message, throwable)
        } else {
            Log.e(TAG, message)
        }
    }

    companion object {
        const val CHANNEL_LOCATION_TRACKING = "location_tracking"
        const val NOTIFICATION_ID = 1001

        const val ACTION_START_TRACKING = "com.tembus.courier.ACTION_START_TRACKING"
        const val ACTION_STOP_TRACKING = "com.tembus.courier.ACTION_STOP_TRACKING"
        const val ACTION_FORCE_SYNC = "com.tembus.courier.ACTION_FORCE_SYNC"
        const val ACTION_GO_OFFLINE = "com.tembus.courier.ACTION_GO_OFFLINE"

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
