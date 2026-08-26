package com.tembus.merchant.data.notifications

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.tembus.merchant.MainActivity
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.launch

/**
 * FOOD-BIKE-064 / 11.4 — Firebase Cloud Messaging receiver untuk order baru.
 *
 * Data-only push payload (dari push_service.go):
 *   type=new_food_order, order_id=..., order_no=..., merchant_id=...
 *
 * App sekarang PAKAI Firebase (FCM) supaya alert reliable di ketiga state
 * (foreground, background, killed) — menggantikan polling saat app terbuka.
 * Polling tetap jalan sebagai fallback via OrderPollWorker bila FCM gagal
 * (tanpa google-services.json yang valid / token belum terdaftar).
 */
class OrderAlertService : com.google.firebase.messaging.FirebaseMessagingService() {

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.i(TAG, "FCM token refreshed: ${token.take(8)}...")
        // 11.4: register token ke backend tiap kali refresh. Dipanggil
        // juga eksplisit di DeviceTokenRegistrar saat login.
        val session = com.tembus.merchant.data.session.AuthSessionManager(this)
        if (session.getAuthTokenSync().isNullOrBlank().not()) {
            kotlinx.coroutines.GlobalScope.launch {
                DeviceTokenRegistrar.register(this@OrderAlertService, token, session)
            }
        } else {
            DeviceTokenRegistrar.enqueuePendingToken(this, token)
        }
    }

    override fun onMessageReceived(remoteMessage: com.google.firebase.messaging.RemoteMessage) {
        super.onMessageReceived(remoteMessage)
        val data = remoteMessage.data
        val type = data["type"] ?: return
        if (type != "new_food_order") return

        val orderId = data["order_id"] ?: remoteMessage.messageId ?: "0"
        val orderNo = data["order_no"] ?: orderId.take(8)
        val text = "Order baru $orderNo menunggu konfirmasi"

        postOrderNotification(orderId, orderNo, text)
    }

    private fun postOrderNotification(orderId: String, orderNo: String, text: String) {
        OrderAlertNotifier.ensureChannel(applicationContext)
        val channel = applicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val ch = NotificationChannel(
                OrderAlertNotifier.CHANNEL_ID,
                OrderAlertNotifier.CHANNEL_NAME,
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Notifikasi order baru masuk (suara + getar)"
                enableVibration(true)
                vibrationPattern = OrderAlertNotifier.VIBRATION_PATTERN
                setSound(
                    RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                )
            }
            channel.createNotificationChannel(ch)
        }

        val intent = Intent(applicationContext, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra(EXTRA_ORDER_ID, orderId)
        }
        val pendingIntent = PendingIntent.getActivity(
            applicationContext,
            orderId.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notif = NotificationCompat.Builder(applicationContext, OrderAlertNotifier.CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("Order baru masuk!")
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()

        try {
            NotificationManagerCompat.from(applicationContext).notify(NOTIF_ID_NEW_ORDER + orderId.hashCode(), notif)
        } catch (e: SecurityException) {
            Log.w(TAG, "POST_NOTIFICATIONS belum di-grant; order tetap terlihat saat app dibuka.")
        }
    }

    companion object {
        private const val TAG = "OrderAlertService"
        const val EXTRA_ORDER_ID = "com.tembus.merchant.EXTRA_ORDER_ID"
        const val NOTIF_ID_NEW_ORDER = 1000
    }
}
