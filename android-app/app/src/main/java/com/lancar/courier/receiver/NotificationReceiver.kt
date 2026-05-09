package com.lancar.courier.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.app.NotificationManagerCompat

/**
 * Notification Action Receiver
 * 
 * Handles notification action buttons (dismiss, accept, etc.)
 */
class NotificationReceiver : BroadcastReceiver() {
    
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        
        when (action) {
            ACTION_DISMISS -> {
                val notificationId = intent.getIntExtra(EXTRA_NOTIFICATION_ID, -1)
                if (notificationId != -1) {
                    NotificationManagerCompat.from(context).cancel(notificationId)
                }
            }
            ACTION_ACCEPT -> {
                // Handle accept action - would launch order acceptance flow
                val orderId = intent.getStringExtra(EXTRA_ORDER_ID) ?: return
                Log.d("NotificationReceiver", "Order accepted: $orderId")
                // TODO: Implement order acceptance via repository/API
            }
        }
    }
    
    companion object {
        const val ACTION_DISMISS = "com.lancar.courier.ACTION_DISMISS"
        const val ACTION_ACCEPT = "com.lancar.courier.ACTION_ACCEPT"
        const val EXTRA_NOTIFICATION_ID = "notification_id"
        const val EXTRA_ORDER_ID = "order_id"
    }
}
