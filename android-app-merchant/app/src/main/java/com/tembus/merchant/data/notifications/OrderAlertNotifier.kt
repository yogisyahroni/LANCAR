package com.tembus.merchant.data.notifications

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.tembus.merchant.MainActivity

/**
 * FB-106 — Alert suara/getar untuk order baru.
 *
 * Merchant app belum pakai FCM (polling order via API). Notifier ini men-trigger
 * local notification IMPORTANT dengan channel "order_baru" (importance HIGH,
 * sound default + vibration pattern khas) begitu ada order baru berstatus
 * pending_merchant yang belum pernah dilihat.
 *
 * Setelah infrastruktur FCM terpasang (google-services.json + FirebaseMessagingService),
 * channel yang sama bisa dipakai untuk menampilkan push notification order baru.
 */
class OrderAlertNotifier(context: Context) {

    private val appContext = context.applicationContext
    private val prefs: SharedPreferences =
        appContext.getSharedPreferences("order_alert", Context.MODE_PRIVATE)

    companion object {
        const val CHANNEL_ID = "order_baru"
        const val CHANNEL_NAME = "Order Baru"
        const val PREFS_SEEN_ORDERS = "seen_order_ids"

        /** Vibration khas "order baru": 3 getaran pendek (berbeda dari notif biasa). */
        val VIBRATION_PATTERN = longArrayOf(0, 200, 100, 200, 100, 200)

        /** Ambil set order id yang pernah dilihat (persist antar restart app). */
        fun seenOrderIds(prefs: SharedPreferences): Set<String> =
            prefs.getStringSet(PREFS_SEEN_ORDERS, emptySet()) ?: emptySet()

        /** Buat notification channel (idempoten) — dipakai FCM + polling notifier. */
        fun ensureChannel(context: Context) {
            val appContext = context.applicationContext
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Notifikasi order baru masuk (suara + getar)"
                enableVibration(true)
                vibrationPattern = VIBRATION_PATTERN
                setSound(
                    RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                )
            }
            appContext.getSystemService(NotificationManager::class.java)
                .createNotificationChannel(channel)
        }
    }

    fun ensureChannel() = ensureChannel(appContext)

    /**
     * Tandai order sebagai sudah dilihat (baseline / setelah alert dipicu).
     * Dipanggil setiap kali list order berhasil dimuat.
     */
    fun markOrdersSeen(orderIds: Set<String>) {
        prefs.edit().putStringSet(PREFS_SEEN_ORDERS, orderIds).apply()
    }

    /**
     * Kirim alert lokal untuk setiap order baru yang belum pernah dilihat.
     * Return daftar order id yang di-alert (untuk baseline seen berikutnya).
     *
     * @return order ids yang baru di-alert (empty kalau tidak ada yang baru)
     */
    fun alertNewOrders(orderIds: Set<String>, merchantName: String?): Set<String> {
        if (orderIds.isEmpty()) return emptySet()
        val seen = seenOrderIds(prefs)
        val fresh = orderIds - seen
        if (fresh.isEmpty()) return emptySet()

        fresh.forEachIndexed { index, orderId ->
            postNotification(
                orderId = orderId,
                title = "Order baru masuk!",
                text = if (fresh.size > 1) {
                    "$merchantName — ${fresh.size} order baru menunggu konfirmasi"
                } else {
                    "$merchantName — ada order baru menunggu konfirmasi"
                },
                notificationId = 1000 + index
            )
        }
        return fresh
    }

    private fun postNotification(orderId: String, title: String, text: String, notificationId: Int) {
        ensureChannel()

        val intent = Intent(appContext, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            appContext,
            notificationId,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(appContext, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()

        try {
            NotificationManagerCompat.from(appContext).notify(notificationId, notification)
        } catch (e: SecurityException) {
            // POST_NOTIFICATIONS belum di-grant (Android 13+) — abaikan diam-diam;
            // order tetap terlihat saat app dibuka.
        }
    }
}
