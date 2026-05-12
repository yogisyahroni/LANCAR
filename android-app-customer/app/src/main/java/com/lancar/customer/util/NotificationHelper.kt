package com.lancar.customer.util

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import com.lancar.customer.LANCARApplication

/**
 * Notification Helper Utility
 * 
 * Provides helper methods for creating and managing notifications
 * across foreground and background states.
 */
class NotificationHelper(private val context: Context) {

    private val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    /**
     * Show a high-priority notification for order assignments
     */
    fun showOrderNotification(
        notificationId: Int,
        title: String,
        body: String,
        orderId: String,
        priority: NotificationPriority = NotificationPriority.HIGH
    ) {
        val channelId = when (priority) {
            NotificationPriority.HIGH -> LANCARApplication.CHANNEL_ORDERS
            NotificationPriority.DEFAULT -> LANCARApplication.CHANNEL_GENERAL
            NotificationPriority.LOW -> LANCARApplication.CHANNEL_GENERAL
        }

        val notification = NotificationCompat.Builder(context, channelId)
            .setSmallIcon(com.lancar.customer.R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(
                when (priority) {
                    NotificationPriority.HIGH -> NotificationCompat.PRIORITY_HIGH
                    NotificationPriority.DEFAULT -> NotificationCompat.PRIORITY_DEFAULT
                    NotificationPriority.LOW -> NotificationCompat.PRIORITY_LOW
                }
            )
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .build()

        notificationManager.notify(notificationId, notification)
    }

    /**
     * Cancel a notification by ID
     */
    fun cancelNotification(notificationId: Int) {
        notificationManager.cancel(notificationId)
    }

    /**
     * Cancel all notifications
     */
    fun cancelAllNotifications() {
        notificationManager.cancelAll()
    }

    enum class NotificationPriority {
        HIGH, DEFAULT, LOW
    }
}
