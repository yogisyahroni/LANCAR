package com.tembus.customer.service

import android.util.Log
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.tembus.customer.BuildConfig
import com.tembus.customer.data.repository.NotificationRepository
import com.tembus.customer.util.NotificationHelper
import com.tembus.customer.util.NotificationEventVersionStore
import com.tembus.customer.worker.CustomerResyncWorker
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import javax.inject.Inject

@AndroidEntryPoint
class TEMBUSFirebaseMessagingService : FirebaseMessagingService() {

    @Inject
    lateinit var notificationRepository: NotificationRepository

    @Inject
    lateinit var notificationHelper: NotificationHelper

    @Inject
    lateinit var notificationEventVersionStore: NotificationEventVersionStore

    private val job = SupervisorJob()
    private val scope = CoroutineScope(Dispatchers.IO + job)

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        debugLog("Device token refreshed")
        
        // Push token to server
        scope.launch {
            val result = notificationRepository.registerDeviceToken(token)
            if (result.isSuccess) {
                debugLog("Device token registered successfully on server")
            } else {
                errorLog("Failed to register device token on server", result.exceptionOrNull())
            }
        }
    }

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)
        debugLog("FCM message received: ${messageSummary(remoteMessage.data)}")

        val orderId = remoteMessage.data["order_id"] ?: remoteMessage.data["orderId"]
        val eventVersion = remoteMessage.data["event_version"] ?: remoteMessage.data["eventVersion"]
        if (!notificationEventVersionStore.accept(orderId, eventVersion)) {
            debugLog("Ignoring stale notification for order=${orderId ?: "none"}")
            return
        }

        // Check if message contains a notification payload.
        remoteMessage.notification?.let {
            debugLog("FCM notification payload received")
            notificationHelper.showNotification(
                title = it.title ?: "TEMBUS",
                message = it.body ?: "",
                data = remoteMessage.data
            )
        }

        // Also check if message contains data payload.
        if (remoteMessage.data.isNotEmpty()) {
            debugLog("FCM data payload received")
            CustomerResyncWorker.enqueue(this, "fcm_data_message")

            // If there's no notification payload but there is data, we might still want to show a notification
            if (remoteMessage.notification == null) {
                val type = remoteMessage.data["type"]
                val (title, body) = when (type) {
                    // FB-084: backend kirim data-only {type: order_cancelled, order_no, reason}
                    "order_cancelled" -> {
                        "Pesanan Dibatalkan" to
                            (remoteMessage.data["reason"] ?: "Pesanan dibatalkan oleh merchant")
                    }
                    else -> {
                        (remoteMessage.data["title"] ?: "TEMBUS") to
                            (remoteMessage.data["body"] ?: "New message from TEMBUS")
                    }
                }
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
        private const val TAG = "TEMBUSFCMService"
    }

    private fun messageSummary(data: Map<String, String>): String {
        val type = data["type"] ?: "unknown"
        val safeKeys = data.keys
            .filterNot { key ->
                key.contains("token", ignoreCase = true) ||
                    key.contains("body", ignoreCase = true) ||
                    key.contains("address", ignoreCase = true) ||
                    key.contains("phone", ignoreCase = true)
            }
            .sorted()
        return "type=$type keys=${safeKeys.joinToString(",")}"
    }

    private fun debugLog(message: String) {
        if (BuildConfig.DEBUG) {
            Log.d(TAG, message)
        }
    }

    private fun errorLog(message: String, throwable: Throwable? = null) {
        if (BuildConfig.DEBUG && throwable != null) {
            Log.e(TAG, message, throwable)
        } else {
            Log.e(TAG, message)
        }
    }
}
