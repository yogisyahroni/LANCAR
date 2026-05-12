package com.lancar.customer.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

class NotificationReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        Log.d(TAG, "Notification action received: ${intent.action}")
        // TODO: Handle notification actions
    }

    companion object {
        private const val TAG = "NotificationReceiver"
    }
}

class NotificationDismissReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        Log.d("NotifDismissReceiver", "Notification dismissed")
    }
}
