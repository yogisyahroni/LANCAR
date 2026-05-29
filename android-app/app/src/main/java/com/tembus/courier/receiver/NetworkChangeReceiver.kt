package com.tembus.courier.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.util.Log
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.tembus.courier.worker.OrderSyncWorker

/**
 * Network Change Receiver
 * 
 * Detects network connectivity changes and triggers order sync.
 * Ensures pending orders are synced when network becomes available.
 */
class NetworkChangeReceiver : BroadcastReceiver() {

    private val TAG = "NetworkChangeReceiver"
    private val connectivityChangeAction = "android.net.conn.CONNECTIVITY_CHANGE"

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == connectivityChangeAction) {
            if (isNetworkAvailable(context)) {
                Log.d(TAG, "Network available - scheduling order sync")
                scheduleOrderSync(context)
            } else {
                Log.d(TAG, "Network unavailable - pending orders will sync when online")
            }
        }
    }

    private fun isNetworkAvailable(context: Context): Boolean {
        val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = connectivityManager.activeNetwork ?: return false
        val capabilities = connectivityManager.getNetworkCapabilities(network) ?: return false
        
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
               capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    }

    private fun scheduleOrderSync(context: Context) {
        val workRequest = OneTimeWorkRequestBuilder<OrderSyncWorker>()
            .setInitialDelay(5, java.util.concurrent.TimeUnit.SECONDS)
            .build()
        
        WorkManager.getInstance(context).enqueue(workRequest)
        Log.d(TAG, "Order sync worker scheduled")
    }
}
