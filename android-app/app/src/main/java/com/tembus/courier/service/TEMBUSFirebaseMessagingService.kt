package com.tembus.courier.service

import android.Manifest
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.RingtoneManager
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.tembus.courier.BuildConfig
import com.tembus.courier.R
import com.tembus.courier.TEMBUSApplication
import com.tembus.courier.data.repository.FCMTokenRepository
import com.tembus.courier.notification.notificationChannelId
import com.tembus.courier.notification.notificationImageUrl
import com.tembus.courier.notification.notificationLaunchTarget
import com.tembus.courier.receiver.NotificationReceiver
import com.tembus.courier.ui.MainActivity
import com.tembus.courier.util.OrderSyncSignalBus
import com.tembus.courier.worker.OrderSyncWorker
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.net.HttpURLConnection
import java.net.URL
import javax.inject.Inject

/**
 * TEMBUS Firebase Messaging Service
 *
 * Handles incoming FCM messages for both foreground and background states.
 * Creates notification channels and displays notifications for order assignments,
 * chat, SOS, and admin broadcasts.
 */
@AndroidEntryPoint
class TEMBUSFirebaseMessagingService : FirebaseMessagingService() {

    @Inject
    lateinit var fcmTokenRepository: FCMTokenRepository

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val tag = "FCM_TEMBUS"

    override fun onCreate() {
        super.onCreate()
        debugLog("FCM service created")
    }

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        debugLog("FCM message received: ${messageSummary(remoteMessage.data)}")

        if (remoteMessage.data.isNotEmpty()) {
            handleDataMessage(remoteMessage.data)
            return
        }

        remoteMessage.notification?.let { notification ->
            debugLog("FCM notification payload received")
            showNotification(
                title = notification.title ?: "TEMBUS Courier",
                body = notification.body ?: "",
                data = emptyMap(),
            )
        }
    }

    override fun onDeletedMessages() {
        super.onDeletedMessages()
        debugLog("FCM messages deleted by server")
    }

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        debugLog("FCM token refreshed")
        serviceScope.launch {
            val result = fcmTokenRepository.registerTokenIfLoggedIn()
            if (result.isSuccess) {
                debugLog("FCM token registered with backend")
            } else {
                val exc = result.exceptionOrNull()
                if (exc != null) {
                    debugLog("FCM token registration skipped or failed: ${exc::class.java.simpleName}")
                }
            }
        }
    }

    private fun handleDataMessage(data: Map<String, String>) {
        when (data["type"] ?: "unknown") {
            "on_demand_offer" -> {
                signalOrderRefresh()
                val serviceCode = data["service_code"] ?: ""
                val isMaintenance = serviceCode.startsWith("tambal_ban") || serviceCode.startsWith("towing")
                val title = data["title"] ?: if (isMaintenance) "Pekerjaan Baru" else "Pekerjaan On Demand Baru"
                val body = data["body"] ?: if (isMaintenance) {
                    "Terima pekerjaan untuk mulai menuju lokasi layanan."
                } else {
                    "Terima pekerjaan untuk mulai navigasi ke pickup."
                }
                showNotification(title, body, data)
            }
            "order_assignment" -> {
                signalOrderRefresh()
                showNotification(
                    title = data["title"] ?: "New Order Assignment",
                    body = data["body"] ?: "You have a new order assigned",
                    data = data,
                )
            }
            "order_status_update" -> showNotification(
                title = data["title"] ?: "Order Update",
                body = data["body"] ?: "",
                data = data,
            )
            "chat_message" -> showNotification(
                title = data["title"] ?: "Pesan Baru Dari Customer 💬",
                body = data["body"] ?: "Ketuk untuk membalas pesan customer.",
                data = data,
            )
            "sos_emergency_dispatch" -> showNotification(
                title = data["title"] ?: "⚠️ PANGGILAN DARURAT (SOS)",
                body = data["body"] ?: "Rekan Anda membutuhkan bantuan! Ketuk untuk menerima.",
                data = data,
            )
            "sos_resolved" -> {
                val prefs = applicationContext.getSharedPreferences("sos_prefs", Context.MODE_PRIVATE)
                prefs.edit()
                    .putBoolean("is_sos_active", false)
                    .remove("active_incident_id")
                    .apply()
                showNotification(
                    title = data["title"] ?: "🚨 SOS Selesai",
                    body = data["body"] ?: "Insiden SOS telah ditutup. Sistem peringatan dinormalkan kembali.",
                    data = data,
                )
            }
            "admin_broadcast", "broadcast" -> {
                showBroadcastNotification(data)
            }
            else -> showNotification(
                title = data["title"] ?: "TEMBUS Update",
                body = data["body"] ?: "",
                data = data,
            )
        }
    }

    private fun signalOrderRefresh() {
        OrderSyncSignalBus.signal(OrderSyncSignalBus.REASON_PUSH_ORDER)
        val syncRequest = OneTimeWorkRequestBuilder<OrderSyncWorker>().build()
        WorkManager.getInstance(applicationContext).enqueueUniqueWork(
            "order_sync_push_signal",
            ExistingWorkPolicy.REPLACE,
            syncRequest,
        )
    }

    private fun showBroadcastNotification(data: Map<String, String>) {
        val title = data["title"] ?: "Pengumuman Baru"
        val body = data["body"] ?: "Buka inbox untuk melihat detail pengumuman."
        showNotification(
            title = title,
            body = body,
            data = data + mapOf("open_inbox" to "true"),
        )
    }

    private fun showNotification(title: String, body: String, data: Map<String, String>) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(
                applicationContext,
                Manifest.permission.POST_NOTIFICATIONS,
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            warnLog("Notification skipped because POST_NOTIFICATIONS permission is not granted")
            return
        }

        val type = data["type"] ?: "unknown"
        val orderId = data["order_id"] ?: data["orderId"]
        val launchTarget = notificationLaunchTarget(data)

        val intent = Intent(applicationContext, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("notification_data", data.toString())
            if (launchTarget.openInbox) {
                putExtra("open_inbox", true)
            }
            launchTarget.chatOrderId?.let { putExtra("chat_order_id", it) }
            launchTarget.selectedOrderId?.let { putExtra("selected_order_id", it) }
        }

        val pendingIntent = PendingIntent.getActivity(
            applicationContext,
            System.currentTimeMillis().toInt(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val fullScreenIntent = Intent(applicationContext, com.tembus.courier.ui.screens.IncomingOfferActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            data.forEach { (key, value) -> putExtra(key, value) }
            putExtra(NotificationReceiver.EXTRA_ORDER_ID, data["order_id"] ?: data["orderId"] ?: "")
            putExtra(NotificationReceiver.EXTRA_DISPATCH_ID, data["dispatch_id"] ?: "")
            putExtra(NotificationReceiver.EXTRA_OFFER_EXPIRES_AT, data["offer_expires_at"] ?: "")
            putExtra(NotificationReceiver.EXTRA_OFFER_TTL_SECONDS, data["offer_ttl_seconds"] ?: "")
            putExtra(NotificationReceiver.EXTRA_PICKUP_ADDRESS, data["pickup_address"] ?: "")
            putExtra(NotificationReceiver.EXTRA_PICKUP_TIME, data["pickup_time"] ?: "")
            putExtra(NotificationReceiver.EXTRA_DROP_ADDRESS, data["drop_address"] ?: "")
            putExtra(NotificationReceiver.EXTRA_DISTANCE, data["distance"] ?: "")
            putExtra(NotificationReceiver.EXTRA_FEE, data["fee"] ?: "")
            putExtra(NotificationReceiver.EXTRA_ESTIMATED_NET_EARNINGS, data["estimated_net_earnings"] ?: "")
            putExtra(NotificationReceiver.EXTRA_MODEL, data["model"] ?: "P2P")
            putExtra(NotificationReceiver.EXTRA_LEG_NUMBER, data["leg_number"]?.toIntOrNull() ?: 1)
            putExtra(NotificationReceiver.EXTRA_WORKFLOW_ROLE, data["workflow_role"] ?: "on_demand")
            putExtra(NotificationReceiver.EXTRA_CUSTOMER_NAME, data["customer_name"] ?: "")
        }

        val acceptIntent = Intent(applicationContext, NotificationReceiver::class.java).apply {
            action = NotificationReceiver.ACTION_ACCEPT
            putExtra(NotificationReceiver.EXTRA_ORDER_ID, data["order_id"] ?: "")
            putExtra(NotificationReceiver.EXTRA_DISPATCH_ID, data["dispatch_id"] ?: "")
            putExtra(NotificationReceiver.EXTRA_OFFER_EXPIRES_AT, data["offer_expires_at"] ?: "")
            putExtra(NotificationReceiver.EXTRA_OFFER_TTL_SECONDS, data["offer_ttl_seconds"] ?: "")
            putExtra(NotificationReceiver.EXTRA_PICKUP_ADDRESS, data["pickup_address"] ?: "")
            putExtra(NotificationReceiver.EXTRA_PICKUP_TIME, data["pickup_time"] ?: "")
            putExtra(NotificationReceiver.EXTRA_DROP_ADDRESS, data["drop_address"] ?: "")
            putExtra(NotificationReceiver.EXTRA_DISTANCE, data["distance"] ?: "")
            putExtra(NotificationReceiver.EXTRA_FEE, data["fee"] ?: "")
            putExtra(NotificationReceiver.EXTRA_ESTIMATED_NET_EARNINGS, data["estimated_net_earnings"] ?: "")
            putExtra(NotificationReceiver.EXTRA_MODEL, data["model"] ?: "P2P")
            putExtra(NotificationReceiver.EXTRA_LEG_NUMBER, data["leg_number"]?.toIntOrNull() ?: 1)
            putExtra(NotificationReceiver.EXTRA_WORKFLOW_ROLE, data["workflow_role"] ?: "on_demand")
            putExtra(NotificationReceiver.EXTRA_CUSTOMER_NAME, data["customer_name"] ?: "")
        }
        val acceptPendingIntent = PendingIntent.getBroadcast(
            applicationContext,
            1,
            acceptIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)

        val channelId = notificationChannelId(data)
        val notificationPriority = when (channelId) {
            TEMBUSApplication.CHANNEL_BROADCASTS -> NotificationCompat.PRIORITY_DEFAULT
            else -> NotificationCompat.PRIORITY_HIGH
        }

        val builder = NotificationCompat.Builder(applicationContext, channelId)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(notificationPriority)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .setSound(soundUri)
            .setVibrate(longArrayOf(0, 800, 400, 800, 400, 1000))
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))

        if (type == "admin_broadcast" || type == "broadcast") {
            notificationImageUrl(data)
                ?.let(::loadNotificationBitmap)
                ?.let { bitmap ->
                    builder.setLargeIcon(bitmap)
                        .setStyle(
                            NotificationCompat.BigPictureStyle()
                                .bigPicture(bitmap)
                                .setSummaryText(body),
                        )
                }
        }

        if (type == "order_assignment" || type == "on_demand_offer" || type == "sos_emergency_dispatch") {
            val fullScreenPendingIntent = PendingIntent.getActivity(
                applicationContext,
                System.currentTimeMillis().toInt(),
                fullScreenIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )

            builder.setCategory(NotificationCompat.CATEGORY_ALARM)
                .setFullScreenIntent(fullScreenPendingIntent, true)
                .addAction(
                    NotificationCompat.Action.Builder(
                        R.drawable.ic_dismiss,
                        "Tolak",
                        PendingIntent.getBroadcast(
                            applicationContext,
                            2,
                            Intent(applicationContext, NotificationReceiver::class.java).apply {
                                action = NotificationReceiver.ACTION_DISMISS
                                putExtra(NotificationReceiver.EXTRA_ORDER_ID, orderId ?: "")
                                putExtra(NotificationReceiver.EXTRA_DISPATCH_ID, data["dispatch_id"] ?: "")
                                putExtra(NotificationReceiver.EXTRA_NOTIFICATION_ID, data["notification_id"]?.toIntOrNull() ?: 0)
                            },
                            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                        )
                    ).build()
                )
                .addAction(
                    NotificationCompat.Action.Builder(
                        R.drawable.ic_notification,
                        "Terima",
                        acceptPendingIntent,
                    ).build()
                )
        } else if (type == "chat_message") {
            builder.setCategory(NotificationCompat.CATEGORY_MESSAGE)
        }

        val notification = builder.build()

        try {
            with(NotificationManagerCompat.from(applicationContext)) {
                val notificationId = (title.hashCode() and 0x7FFFFFFF)
                notify(notificationId, notification)
            }
        } catch (e: SecurityException) {
            errorLog("Notification blocked by system permission policy", e)
            return
        }

        debugLog("Notification shown for type=$type")
    }

    private fun loadNotificationBitmap(imageUrl: String): Bitmap? {
        return try {
            val connection = (URL(imageUrl).openConnection() as HttpURLConnection).apply {
                connectTimeout = 1500
                readTimeout = 2000
                instanceFollowRedirects = true
            }
            try {
                val length = connection.contentLengthLong
                if (length > 2_000_000L) return null
                connection.inputStream.use { input -> BitmapFactory.decodeStream(input) }
            } finally {
                connection.disconnect()
            }
        } catch (error: Exception) {
            warnLog("Broadcast image skipped: ${error::class.java.simpleName}")
            null
        }
    }

    private fun messageSummary(data: Map<String, String>): String {
        val type = data["type"] ?: "unknown"
        val safeKeys = data.keys
            .filterNot { key ->
                key.contains("token", ignoreCase = true) ||
                    key.contains("body", ignoreCase = true) ||
                    key.contains("address", ignoreCase = true) ||
                    key.contains("phone", ignoreCase = true) ||
                    key.contains("customer", ignoreCase = true)
            }
            .sorted()
        return "type=$type keys=${safeKeys.joinToString(",")}"
    }

    private fun debugLog(message: String) {
        if (BuildConfig.DEBUG) {
            Log.d(tag, message)
        }
    }

    private fun warnLog(message: String) {
        Log.w(tag, message)
    }

    private fun errorLog(message: String, throwable: Throwable? = null) {
        if (BuildConfig.DEBUG && throwable != null) {
            Log.e(tag, message, throwable)
        } else {
            Log.e(tag, message)
        }
    }
}
