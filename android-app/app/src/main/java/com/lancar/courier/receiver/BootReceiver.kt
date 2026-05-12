package com.lancar.courier.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import com.lancar.courier.LANCARApplication
import com.lancar.courier.data.repository.FCMTokenRepository
import com.lancar.courier.data.repository.LocationRepository
import com.lancar.courier.data.session.AuthSessionManager
import com.lancar.courier.service.LocationTrackerService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

/**
 * Boot Receiver
 *
 * After device reboot:
 * 1. Re-registers FCM token with backend
 * 2. Restarts LocationTrackerService if courier is logged in
 * WorkManager periodic jobs are automatically rescheduled by WorkManager itself.
 */
class BootReceiver : BroadcastReceiver() {
    
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            Log.d("BootReceiver", "Device booted - registering FCM token and restarting location tracking")
            
            // Use a background coroutine scope since we can't tie to UI lifecycle
            CoroutineScope(Dispatchers.IO + Job()).launch {
                val fcmTokenRepository = FCMTokenRepository(context)
                val result = fcmTokenRepository.registerTokenIfLoggedIn()
                if (result.isSuccess) {
                    Log.d("BootReceiver", "FCM token registered successfully after boot")
                } else {
                    val exc = result.exceptionOrNull()
                    if (exc != null) {
                        Log.d("BootReceiver", "FCM registration skipped or failed: ${exc.message}")
                    }
                }
                
                // Restart location tracking service if courier is logged in
                val locationRepository = LocationRepository(context)
                val authSessionManager = com.lancar.courier.data.session.AuthSessionManager(context)
                
                val isLoggedIn = authSessionManager.isLoggedIn.first()
                if (isLoggedIn) {
                    context.startService(LocationTrackerService.startIntent(context))
                    Log.d("BootReceiver", "Location tracking service restarted")
                }
            }
        }
    }
}
