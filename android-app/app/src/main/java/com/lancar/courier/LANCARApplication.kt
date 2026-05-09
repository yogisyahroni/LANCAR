package com.lancar.courier

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.util.Log
import androidx.work.Configuration
import androidx.work.WorkManager
import com.lancar.courier.data.repository.FCMTokenRepository
import com.lancar.courier.data.repository.OrderRepository
import com.lancar.courier.receiver.OrderSyncWorker

/**
 * LANCAR Application
 * 
 * Application class for initializing global components.
 * Sets up notification channels and background workers.
 */
class LANCARApplication : Application(), Configuration.Provider {

    private val TAG = "LANCARApplication"

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "Application created")

        // Initialize notification channels
        createNotificationChannels()

        // Initialize WorkManager
        WorkManager.initialize(this, Configuration.Builder().build())

        // Initialize repositories
        val orderRepository = OrderRepository(applicationContext)
        val fcmTokenRepository = FCMTokenRepository(applicationContext)

        // Register FCM token if courier is logged in
        // This will be called from MainActivity as well
    }

    private fun createNotificationChannels() {
        val notificationManager = getSystemService(NotificationManager::class.java)
        
        // Orders channel - high priority for assignment alerts
        val ordersChannel = NotificationChannel(
            CHANNEL_ORDERS,
            "Order Assignments",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Notifications for new order assignments and updates"
            enableVibration(true)
            setShowBadge(true)
        }

        // General channel - for other notifications
        val generalChannel = NotificationChannel(
            CHANNEL_GENERAL,
            "General",
            NotificationManager.IMPORTANCE_DEFAULT
        ).apply {
            description = "General app notifications"
        }

        notificationManager.createNotificationChannels(listOf(ordersChannel, generalChannel))
    }

    override fun getWorkManagerConfiguration(): Configuration {
        return Configuration.Builder().build()
    }

    companion object {
        const val CHANNEL_ORDERS = "lancar_orders"
        const val CHANNEL_GENERAL = "lancar_general"
    }
}
