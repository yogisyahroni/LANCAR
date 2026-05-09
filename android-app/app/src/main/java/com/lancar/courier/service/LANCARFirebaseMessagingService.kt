package com.lancar.courier.service

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.lancar.courier.LANCARApplication
import com.lancar.courier.R
import com.lancar.courier.data.repository.FCMTokenRepository
import com.lancar.courier.receiver.NotificationDismissReceiver
import com.lancar.courier.ui.MainActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

/**
 * LANCAR Firebase Messaging Service
 * 
 * Handles incoming FCM messages for both foreground and background states.
 * Creates notification channels and displays notifications for order assignments.
 */
class LANCARFirebaseMessagingService : FirebaseMessagingService() {

    private val TAG = "FCM_LANCAR"

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "FCM Service Created")
    }

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        Log.d(TAG, "From: ${remoteMessage.from}")
        Log.d(TAG, "Message Data: ${remoteMessage.data}")

        // Handle data payload
        if (remoteMessage.data.isNotEmpty()) {
            handleDataMessage(remoteMessage.data)
        }

        // Handle notification payload
        if (remoteMessage.notification != null) {
            Log.d(TAG, "Message Notification Body: ${remoteMessage.notification!!.body}")
            showNotification(
                remoteMessage.notification!!.title ?: "Lancar Courier",
                remoteMessage.notification!!.body ?: "",
                remoteMessage.data
            )
        }
    }

    override fun onDeletedMessages() {
        super.onDeletedMessages()
        Log.d(TAG, "Messages deleted by server")
    }

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.d(TAG, "Refreshed FCM token: $token")
        // Register new token with backend if courier is logged in
        CoroutineScope(Dispatchers.IO + Job()).launch {
            val fcmTokenRepository = FCMTokenRepository(applicationContext)
            val result = fcmTokenRepository.registerTokenIfLoggedIn()
            if (result.isSuccess) {
                Log.d(TAG, "New FCM token registered with backend")
            } else {
                val exc = result.exceptionOrNull()
                if (exc != null) {
                    Log.d(TAG, "New token registration skipped/failed: ${exc.message}")
                }
            }
        }
    }

    private fun handleDataMessage(data: Map<String, String>) {
        val type = data["type"] ?: "unknown"
        
        when (type) {
            "order_assignment" -> {
                val title = data["title"] ?: "New Order Assignment"
                val body = data["body"] ?: "You have a new order assigned"
                showNotification(title, body, data)
            }
            "order_status_update" -> {
                val title = data["title"] ?: "Order Update"
                val body = data["body"] ?: ""
                showNotification(title, body, data)
            }
            else -> {
                val title = data["title"] ?: "Lancar Update"
                val body = data["body"] ?: ""
                showNotification(title, body, data)
            }
        }
    }

    private fun showNotification(title: String, body: String, data: Map<String, String>) {
        val intent = Intent(applicationContext, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("notification_data", data.toString())
        }

        val pendingIntent = PendingIntent.getActivity(
            applicationContext,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(applicationContext, LANCARApplication.CHANNEL_ORDERS)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .addAction(
                NotificationCompat.Action.Builder(
                    R.drawable.ic_dismiss,
                    "Dismiss",
                    PendingIntent.getBroadcast(
                        applicationContext,
                        0,
                        Intent(applicationContext, NotificationDismissReceiver::class.java)
                            .putExtra("notification_id", data["notification_id"] ?: ""),
                        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                    )
                ).build()
            )
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .build()

        with(NotificationManagerCompat.from(applicationContext)) {
            val notificationId = (title.hashCode() and 0x7FFFFFFF)
            notify(notificationId, notification)
        }

        Log.d(TAG, "Notification shown: $title")
    }
}
