package com.lancar.customer.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

class NetworkChangeReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        Log.d(TAG, "Network state changed")
        // TODO: Handle network sync
    }

    companion object {
        private const val TAG = "NetworkChangeReceiver"
    }
}
