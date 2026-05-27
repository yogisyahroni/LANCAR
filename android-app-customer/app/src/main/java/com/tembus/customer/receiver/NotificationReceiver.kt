package com.tembus.customer.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.tembus.customer.worker.CustomerResyncWorker

class NotificationReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        Log.d(TAG, "Notification action received: ${intent.action}")
        CustomerResyncWorker.enqueue(context, intent.action ?: "notification_action")
    }

    companion object {
        private const val TAG = "NotificationReceiver"
    }
}

class NotificationDismissReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        Log.d("NotifDismissReceiver", "Notification dismissed")
        CustomerResyncWorker.enqueue(context, "notification_dismissed")
    }
}
