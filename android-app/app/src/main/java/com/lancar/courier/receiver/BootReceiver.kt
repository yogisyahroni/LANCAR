package com.lancar.courier.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.content.ContextCompat
import android.util.Log
import com.lancar.courier.TEMBUSApplication
import com.lancar.courier.data.repository.FCMTokenRepository
import com.lancar.courier.data.repository.LocationRepository
import com.lancar.courier.data.session.AuthSessionManager
import com.lancar.courier.service.LocationTrackerService
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Boot Receiver
 *
 * After device reboot:
 * 1. Re-registers FCM token with backend
 * 2. Restarts LocationTrackerService if courier is logged in
 * WorkManager periodic jobs are automatically rescheduled by WorkManager itself.
 */
@AndroidEntryPoint
class BootReceiver : BroadcastReceiver() {

    @Inject
    lateinit var fcmTokenRepository: FCMTokenRepository

    @Inject
    lateinit var authSessionManager: AuthSessionManager

    private val coroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            Log.d("BootReceiver", "Device booted - registering FCM token and restarting location tracking")
            
            coroutineScope.launch {
                val result = fcmTokenRepository.registerTokenIfLoggedIn()
                if (result.isSuccess) {
                    Log.d("BootReceiver", "FCM token registered successfully after boot")
                } else {
                    val exc = result.exceptionOrNull()
                    if (exc != null) {
                        Log.d("BootReceiver", "FCM registration skipped or failed: ${exc.message}")
                    }
                }
                
                val isLoggedIn = authSessionManager.isLoggedIn.first()
                val isOnline = authSessionManager.isOnline.first()
                if (isLoggedIn && isOnline) {
                    ContextCompat.startForegroundService(context, LocationTrackerService.startIntent(context))
                    Log.d("BootReceiver", "Location tracking service restarted")
                } else {
                    Log.d("BootReceiver", "Location tracking not restarted. loggedIn=$isLoggedIn online=$isOnline")
                }
            }
        }
    }
}
