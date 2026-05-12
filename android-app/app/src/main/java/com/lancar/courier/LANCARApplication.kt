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
import com.lancar.courier.receiver.OrderSyncWorker
import androidx.hilt.work.HiltWorkerFactory
import dagger.hilt.android.HiltAndroidApp
import java.util.concurrent.TimeUnit
import javax.inject.Inject

/**
 * LANCAR Application
 *
 * Application class for initializing global components:
 * - API client with auth interceptor
 * - Notification channels
 * - Periodic WorkManager sync (every 15 minutes, network required)
 */
@HiltAndroidApp
class LANCARApplication : Application(), Configuration.Provider {

    @Inject
    lateinit var workerFactory: HiltWorkerFactory

    private val TAG = "LANCARApplication"

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "Application created")

        // AuthSessionManager & ApiClient will now operate through Hilt
        // Initialize notification channels
        createNotificationChannels()

        // Schedule periodic background sync — runs every 15 min when network available
        scheduleOrderSync()

        Log.d(TAG, "Initialization complete")
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

    companion object {
        const val CHANNEL_ORDERS = "lancar_orders"
        const val CHANNEL_GENERAL = "lancar_general"
        const val WORKER_ORDER_SYNC = "order_sync_periodic"
    }
}
