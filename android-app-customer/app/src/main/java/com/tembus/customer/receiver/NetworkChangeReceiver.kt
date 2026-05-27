package com.tembus.customer.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.util.Log
import com.tembus.customer.worker.CustomerResyncWorker

class NetworkChangeReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val activeNetwork = connectivityManager.activeNetwork
        val capabilities = activeNetwork?.let { connectivityManager.getNetworkCapabilities(it) }
        val isConnected = capabilities?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true
        Log.d(TAG, "Network state changed. connected=$isConnected")
        if (isConnected) {
            CustomerResyncWorker.enqueue(context, "network_available")
        }
    }

    companion object {
        private const val TAG = "NetworkChangeReceiver"
    }
}
