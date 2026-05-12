package com.lancar.customer.service

import android.app.Service
import android.content.Intent
import android.os.IBinder
import android.util.Log

class LocationTrackerService : Service() {

    override fun onBind(intent: Intent?): IBinder? {
        return null
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(TAG, "LocationTrackerService started")
        return START_STICKY
    }

    companion object {
        private const val TAG = "LocationTrackerService"
    }
}
