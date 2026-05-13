package com.lancar.customer.service

import android.util.Log
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.lancar.customer.data.repository.NotificationRepository
import com.lancar.customer.util.NotificationHelper
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import javax.inject.Inject

@AndroidEntryPoint
class LANCARFirebaseMessagingService : FirebaseMessagingService() {

    @Inject
    lateinit var notificationRepository: NotificationRepository

    @Inject
    lateinit var notificationHelper: NotificationHelper

    private val job = SupervisorJob()
    private val scope = CoroutineScope(Dispatchers.IO + job)

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.d(TAG, "Refreshed token: $token")
        
        // Push token to server
        scope.launch {
            val result = notificationRepository.registerDeviceToken(token)
            if (result.isSuccess) {
                Log.d(TAG, "Device token registered successfully on server")
            } else {
                Log.e(TAG, "Failed to register device token on server: ${result.exceptionOrNull()?.message}")
            }
        }
    }

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)
        Log.d(TAG, "From: ${remoteMessage.from}")

        // Check if message contains a notification payload.
        remoteMessage.notification?.let {
            Log.d(TAG, "Message Notification Body: ${it.body}")
            notificationHelper.showNotification(
                title = it.title ?: "LANCAR",
                message = it.body ?: "",
                data = remoteMessage.data
            )
        }

        // Also check if message contains data payload.
        if (remoteMessage.data.isNotEmpty()) {
            Log.d(TAG, "Message data payload: ${remoteMessage.data}")
            
            // If there's no notification payload but there is data, we might still want to show a notification
            if (remoteMessage.notification == null) {
                val title = remoteMessage.data["title"] ?: "LANCAR"
                val body = remoteMessage.data["body"] ?: "New message from LANCAR"
                notificationHelper.showNotification(
                    title = title,
                    message = body,
                    data = remoteMessage.data
                )
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        job.cancel()
    }

    companion object {
        private const val TAG = "LANCARFCMService"
    }
}
