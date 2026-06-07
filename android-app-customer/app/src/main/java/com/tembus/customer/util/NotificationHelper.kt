package com.tembus.customer.util

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import com.tembus.customer.ui.MainActivity
import com.tembus.customer.R
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class NotificationHelper @Inject constructor(
    @ApplicationContext private val context: Context
) {
    private val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    companion object {
        private const val CHANNEL_UPDATES_ID = "tembus_customer_updates"
        private const val CHANNEL_MESSAGES_ID = "tembus_customer_messages"
        private const val CHANNEL_MARKETING_ID = "tembus_customer_marketing"
        private const val CHANNEL_SUPPORT_ID = "tembus_customer_support"
    }

    init {
        createNotificationChannel()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channels = listOf(
                NotificationChannel(
                    CHANNEL_MESSAGES_ID,
                    "Pesan Order",
                    NotificationManager.IMPORTANCE_HIGH
                ).apply {
                    description = "Chat order dan pesan penting terkait pengiriman."
                },
                NotificationChannel(
                    CHANNEL_UPDATES_ID,
                    "Aktivitas Pengiriman",
                    NotificationManager.IMPORTANCE_DEFAULT
                ).apply {
                    description = "Status order, aktivitas akun, dan informasi operasional."
                },
                NotificationChannel(
                    CHANNEL_MARKETING_ID,
                    "Promo TEMBUS",
                    NotificationManager.IMPORTANCE_DEFAULT
                ).apply {
                    description = "Promo dan penawaran resmi TEMBUS yang kamu izinkan."
                },
                NotificationChannel(
                    CHANNEL_SUPPORT_ID,
                    "Bantuan & Support",
                    NotificationManager.IMPORTANCE_DEFAULT
                ).apply {
                    description = "Balasan bantuan dan informasi support TEMBUS."
                }
            )
            notificationManager.createNotificationChannels(channels)
        }
    }

    fun showNotification(title: String, message: String, data: Map<String, String>? = null) {
        val dataPayload = data.orEmpty()
        val category = dataPayload["category"].orEmpty().lowercase()
        val channelId = when (category) {
            "message" -> CHANNEL_MESSAGES_ID
            "promo", "marketing" -> CHANNEL_MARKETING_ID
            "support" -> CHANNEL_SUPPORT_ID
            else -> CHANNEL_UPDATES_ID
        }
        val deepLink = dataPayload["deep_link"]
            ?.trim()
            ?.takeIf { value -> value.startsWith("tembus://", ignoreCase = true) }
        val intent = Intent(context, MainActivity::class.java).apply {
            action = if (deepLink.isNullOrBlank()) Intent.ACTION_MAIN else Intent.ACTION_VIEW
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            deepLink?.let { setData(Uri.parse(it)) }
            dataPayload.forEach { (key, value) ->
                putExtra(key, value)
            }
        }

        val pendingIntent = PendingIntent.getActivity(
            context,
            notificationRequestCode(dataPayload),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val builder = NotificationCompat.Builder(context, channelId)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(message)
            .setStyle(NotificationCompat.BigTextStyle().bigText(message))
            .setPriority(if (category == "message") NotificationCompat.PRIORITY_HIGH else NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)

        notificationManager.notify(notificationRequestCode(dataPayload), builder.build())
    }

    private fun notificationRequestCode(data: Map<String, String>): Int {
        val stableId = data["notification_id"]
            ?: data["order_id"]
            ?: data["conversation_id"]
        return stableId?.hashCode() ?: System.currentTimeMillis().toInt()
    }
}
