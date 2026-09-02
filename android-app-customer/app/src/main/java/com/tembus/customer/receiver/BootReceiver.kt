package com.tembus.customer.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.tembus.customer.worker.CustomerResyncWorker

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            // Boot must never start location tracking. Resync runs only when
            // the worker can validate the existing authenticated session.
            Log.d(TAG, "Boot completed, scheduling customer session resync")
            CustomerResyncWorker.enqueue(context, "boot_completed")
        }
    }

    companion object {
        private const val TAG = "BootReceiver"
    }
}
