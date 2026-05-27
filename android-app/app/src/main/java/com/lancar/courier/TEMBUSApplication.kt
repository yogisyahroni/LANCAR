package com.lancar.courier

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.util.Log
import androidx.work.Constraints
import androidx.work.Configuration
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.lancar.courier.data.repository.FCMTokenRepository
import com.lancar.courier.data.repository.OrderRepository
import com.lancar.courier.data.session.AuthSessionManager
import com.lancar.courier.worker.OrderSyncWorker
import androidx.hilt.work.HiltWorkerFactory
import dagger.hilt.android.HiltAndroidApp
import java.util.concurrent.TimeUnit
import android.net.ConnectivityManager
import android.net.Network
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.content.Context
import android.os.Build
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.ExistingWorkPolicy
import com.lancar.courier.util.FirebaseInitializer
import javax.inject.Inject

/**
 * TEMBUS Application
 *
 * Application class for initializing global components:
 * - API client with auth interceptor
 * - Notification channels
 * - Periodic WorkManager sync (every 15 minutes, network required)
 */
@HiltAndroidApp
class TEMBUSApplication : Application(), Configuration.Provider {

    @Inject
    lateinit var workerFactory: HiltWorkerFactory

    private val TAG = "TEMBUSApplication"

    override fun onCreate() {
        super.onCreate()
        
        // 🚨 SECURITY & STABILITY BOUNDARY: Initialize central uncaught exception boundary
        setupUncaughtExceptionHandler()
        
        Log.d(TAG, "Application created")

        FirebaseInitializer.initializeIfConfigured(this)

        // AuthSessionManager & ApiClient will now operate through Hilt
        // Initialize notification channels
        createNotificationChannels()

        initializeWorkManager()

        // Schedule periodic background sync — runs every 15 min when network available
        scheduleOrderSync()

        // Register modern runtime network change listener
        registerNetworkCallback()

        Log.d(TAG, "Initialization complete")
    }

    private fun initializeWorkManager() {
        try {
            WorkManager.initialize(this, workManagerConfiguration)
            Log.d(TAG, "WorkManager initialized with HiltWorkerFactory")
        } catch (e: IllegalStateException) {
            Log.d(TAG, "WorkManager already initialized, keeping existing instance")
        }
    }

    /**
     * Schedule OrderSyncWorker to run every 15 minutes.
     * Requires network. Uses KEEP policy so it won't reschedule if already queued.
     */
    private fun scheduleOrderSync() {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        val syncRequest = PeriodicWorkRequestBuilder<OrderSyncWorker>(
            repeatInterval = 15,
            repeatIntervalTimeUnit = TimeUnit.MINUTES
        )
            .setConstraints(constraints)
            .build()

        WorkManager.getInstance(applicationContext).enqueueUniquePeriodicWork(
            WORKER_ORDER_SYNC,
            ExistingPeriodicWorkPolicy.KEEP,
            syncRequest
        )

        Log.d(TAG, "OrderSyncWorker scheduled (every 15 min, network required)")
    }

    /**
     * Dynamic Jaringan Listener: Menghindari limitasi manifest Android modern.
     * Langsung memicu sinkronisasi instan begitu jaringan online kembali.
     */
    private fun registerNetworkCallback() {
        val connectivityManager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            try {
                connectivityManager.registerDefaultNetworkCallback(object : ConnectivityManager.NetworkCallback() {
                    override fun onAvailable(network: Network) {
                        super.onAvailable(network)
                        Log.d(TAG, "Jaringan TERHUBUNG. Memulai sinkronisasi data instan (PoD/Status)...")
                        triggerImmediateOrderSync()
                    }
                })
            } catch (e: Exception) {
                Log.e(TAG, "Gagal mendaftarkan network callback: ${e.message}")
            }
        }
    }

    private fun triggerImmediateOrderSync() {
        val syncRequest = OneTimeWorkRequestBuilder<OrderSyncWorker>().build()
        WorkManager.getInstance(applicationContext).enqueueUniqueWork(
            "order_sync_immediate",
            ExistingWorkPolicy.REPLACE,
            syncRequest
        )
    }

    private fun createNotificationChannels() {
        val notificationManager = getSystemService(NotificationManager::class.java)

        // Orders channel — high priority for assignment alerts
        val ordersChannel = NotificationChannel(
            CHANNEL_ORDERS,
            "Penugasan Order",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Notifikasi untuk penugasan dan pembaruan order"
            enableVibration(true)
            setShowBadge(true)
            
            // 🚨 ELEVASI SUARA: Gunakan nada dering default HP, bukan bunyi notifikasi pelan
            val audioAttributes = AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .build()
            setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE), audioAttributes)
            vibrationPattern = longArrayOf(0, 800, 400, 800, 400, 1000)
            enableLights(true)
            lightColor = android.graphics.Color.RED
        }

        // General channel — for other notifications
        val generalChannel = NotificationChannel(
            CHANNEL_GENERAL,
            "Umum",
            NotificationManager.IMPORTANCE_DEFAULT
        ).apply {
            description = "Notifikasi umum aplikasi"
        }

        notificationManager.createNotificationChannels(listOf(ordersChannel, generalChannel))
        Log.d(TAG, "Notification channels created")
    }

    // WorkManager configuration — custom logger for debugging
    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder()
            .setWorkerFactory(workerFactory)
            .setMinimumLoggingLevel(Log.INFO)
            .build()

    private fun setupUncaughtExceptionHandler() {
        val defaultHandler = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            try {
                // 💥 DIAGNOSTIC BOUNDARY: Safe-log critical runtime anomalies
                Log.e(TAG, "CRITICAL APOCALYPTIC FATAL ERROR: Thread[${thread.name}] had uncaught crash!", throwable)
            } catch (e: Exception) {
                // Prevent handler recursion crashes
            } finally {
                // Hand-off cleanly back to Firebase Crashlytics and Android OS crash reporting
                defaultHandler?.uncaughtException(thread, throwable)
            }
        }
    }

    companion object {
        const val CHANNEL_ORDERS = "tembus_orders"
        const val CHANNEL_GENERAL = "tembus_general"
        const val WORKER_ORDER_SYNC = "order_sync_periodic"
    }
}
