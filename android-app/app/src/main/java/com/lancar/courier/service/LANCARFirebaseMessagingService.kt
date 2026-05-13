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
import com.lancar.courier.receiver.NotificationReceiver
import com.lancar.courier.service.NotificationDismissReceiver
import com.lancar.courier.ui.MainActivity
import android.media.RingtoneManager
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * LANCAR Firebase Messaging Service
 * 
 * Handles incoming FCM messages for both foreground and background states.
 * Creates notification channels and displays notifications for order assignments.
 */
@AndroidEntryPoint
class LANCARFirebaseMessagingService : FirebaseMessagingService() {

    @Inject
    lateinit var fcmTokenRepository: FCMTokenRepository

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
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
        // Register new token with backend if courier is logged in
        serviceScope.launch {
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
            "chat_message" -> {
                val title = data["title"] ?: "Pesan Baru Dari Customer 💬"
                val body = data["body"] ?: "Ketuk untuk membalas pesan customer."
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
        val type = data["type"] ?: "unknown"
        val orderId = data["order_id"] ?: data["orderId"]

        val intent = Intent(applicationContext, MainActivity::class.java).apply {
            // 🔗 DYNAMIC ROUTING INJECTOR
            if (type == "chat_message") {
                putExtra("chat_order_id", orderId)
            } else if (orderId != null) {
                putExtra("selected_order_id", orderId)
            }
            
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("notification_data", data.toString())
        }

        val pendingIntent = PendingIntent.getActivity(
            applicationContext,
            System.currentTimeMillis().toInt(), // Unique RequestCode prevents caching collisions
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val acceptIntent = Intent(applicationContext, NotificationReceiver::class.java).apply {
            action = NotificationReceiver.ACTION_ACCEPT
            putExtra(NotificationReceiver.EXTRA_ORDER_ID, data["order_id"] ?: "")
            putExtra(NotificationReceiver.EXTRA_PICKUP_ADDRESS, data["pickup_address"] ?: "")
            putExtra(NotificationReceiver.EXTRA_PICKUP_TIME, data["pickup_time"] ?: "")
            putExtra(NotificationReceiver.EXTRA_DROP_ADDRESS, data["drop_address"] ?: "")
            putExtra(NotificationReceiver.EXTRA_DISTANCE, data["distance"] ?: "")
            putExtra(NotificationReceiver.EXTRA_FEE, data["fee"] ?: "")
            putExtra(NotificationReceiver.EXTRA_CUSTOMER_NAME, data["customer_name"] ?: "")
        }
        val acceptPendingIntent = PendingIntent.getBroadcast(
            applicationContext,
            1,
            acceptIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
        
        val builder = NotificationCompat.Builder(applicationContext, LANCARApplication.CHANNEL_ORDERS)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .setSound(soundUri)
            .setVibrate(longArrayOf(0, 800, 400, 800, 400, 1000))
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))

        // 🔔 DYNAMIC SYSTEM BEHAVIOR MAPPING
        if (type == "order_assignment") {
            builder.setCategory(NotificationCompat.CATEGORY_ALARM)
                .setFullScreenIntent(pendingIntent, true) // Bring screen alive!
                .addAction(
                    NotificationCompat.Action.Builder(
                        R.drawable.ic_dismiss,
                        "Tolak",
                        PendingIntent.getBroadcast(
                            applicationContext,
                            2,
                            Intent(applicationContext, NotificationDismissReceiver::class.java)
                                .putExtra("notification_id", data["notification_id"] ?: ""),
                            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                        )
                    ).build()
                )
                .addAction(
                    NotificationCompat.Action.Builder(
                        R.drawable.ic_notification,
                        "Terima",
                        acceptPendingIntent
                    ).build()
                )
        } else if (type == "chat_message") {
            builder.setCategory(NotificationCompat.CATEGORY_MESSAGE)
        }

        val notification = builder.build()

        with(NotificationManagerCompat.from(applicationContext)) {
            val notificationId = (title.hashCode() and 0x7FFFFFFF)
            notify(notificationId, notification)
        }

        Log.d(TAG, "Notification shown: $title")
    }
}
