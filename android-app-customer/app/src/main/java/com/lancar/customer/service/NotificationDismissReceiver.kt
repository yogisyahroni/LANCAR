package com.lancar.customer.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.app.NotificationManagerCompat

/**
 * Handles notification dismiss actions
 */
class NotificationDismissReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val notificationId = intent.getStringExtra("notification_id") ?: return
        Log.d("NotificationDismiss", "Dismissing notification: $notificationId")
        
        try {
            NotificationManagerCompat.from(context).cancel(notificationId.hashCode())
        } catch (e: SecurityException) {
            Log.e("NotificationDismiss", "Permission denied to cancel notification")
        }
    }
}
