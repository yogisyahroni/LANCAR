package com.lancar.courier.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.app.NotificationManagerCompat
import com.lancar.courier.data.api.TEMBUSApiService
import com.lancar.courier.data.model.Order
import com.lancar.courier.data.repository.OrderRepository
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Notification Action Receiver
 *
 * Handles notification action buttons (dismiss, accept).
 * On accept:
 *   1. Save order to local Room DB (offline-first)
 *   2. Confirm acceptance to backend via API
 *   3. If backend fails → needsSync=true, WorkManager will retry
 */
@AndroidEntryPoint
class NotificationReceiver : BroadcastReceiver() {

    @Inject
    lateinit var orderRepository: OrderRepository
    
    @Inject
    lateinit var apiService: TEMBUSApiService

    override fun onReceive(context: Context, intent: Intent) {
        // Must NOT call super.onReceive as BroadcastReceiver.onReceive is abstract.
        
        val action = intent.action ?: return

        when (action) {
            ACTION_DISMISS -> {
                val notificationId = intent.getIntExtra(EXTRA_NOTIFICATION_ID, -1)
                if (notificationId != -1) {
                    NotificationManagerCompat.from(context).cancel(notificationId)
                }
                val orderId = intent.getStringExtra(EXTRA_ORDER_ID)
                val dispatchId = intent.getStringExtra(EXTRA_DISPATCH_ID)
                if (!orderId.isNullOrBlank()) {
                    val pendingResult = goAsync()
                    CoroutineScope(Dispatchers.IO).launch {
                        try {
                            apiService.rejectOnDemandOffer(dispatchId ?: orderId)
                            orderRepository.deleteOrderById(orderId)
                        } catch (e: Exception) {
                            Log.w(TAG, "Reject offer failed: ${e.message}")
                        } finally {
                            pendingResult.finish()
                        }
                    }
                }
                Log.d(TAG, "Notification dismissed")
            }

            ACTION_ACCEPT -> {
                val orderId = intent.getStringExtra(EXTRA_ORDER_ID) ?: return
                Log.d(TAG, "Order accepted from notification: $orderId")

                val order = Order(
                    orderId = orderId,
                    pickupAddress = intent.getStringExtra(EXTRA_PICKUP_ADDRESS) ?: "",
                    pickupTime = intent.getStringExtra(EXTRA_PICKUP_TIME) ?: "",
                    dropAddress = intent.getStringExtra(EXTRA_DROP_ADDRESS) ?: "",
                    distance = intent.getStringExtra(EXTRA_DISTANCE) ?: "",
                    fee = intent.getStringExtra(EXTRA_FEE) ?: "",
                    model = intent.getStringExtra(EXTRA_MODEL) ?: "P2P",
                    legNumber = intent.getIntExtra(EXTRA_LEG_NUMBER, 1),
                    workflowRole = intent.getStringExtra(EXTRA_WORKFLOW_ROLE) ?: "on_demand",
                    dispatchId = intent.getStringExtra(EXTRA_DISPATCH_ID),
                    offerExpiresAt = intent.getStringExtra(EXTRA_OFFER_EXPIRES_AT)?.toLongOrNull(),
                    offerTtlSeconds = intent.getStringExtra(EXTRA_OFFER_TTL_SECONDS)?.toIntOrNull(),
                    customerName = intent.getStringExtra(EXTRA_CUSTOMER_NAME) ?: "",
                    phoneNumber = intent.getStringExtra(EXTRA_PHONE_NUMBER),
                    status = "accepting",
                    needsSync = true // mark for backend confirmation
                )

                // goAsync() extends the BroadcastReceiver lifecycle window beyond 10s.
                // Without this, Android kills the receiver before the coroutine completes,
                // causing silent order acceptance failures or Room DB write corruption.
                val pendingResult = goAsync()
                CoroutineScope(Dispatchers.IO).launch {
                    try {
                        // 1. Save locally first (offline-first guarantee)
                        orderRepository.addOrder(order)
                        Log.d(TAG, "Order saved locally: $orderId")

                        // 2. Confirm acceptance to backend immediately
                        try {
                            val response = apiService.acceptOnDemandOffer(order.dispatchId ?: orderId)
                            if (response.isSuccessful && response.body()?.success == true) {
                                // Mark as synced — no need for WorkManager retry
                                val accepted = response.body()?.data ?: order.copy(status = "accepted")
                                orderRepository.deleteOrderById(orderId)
                                orderRepository.addOrder(accepted.copy(needsSync = false))
                                Log.d(TAG, "Order acceptance confirmed to backend: $orderId")
                            } else {
                                Log.w(TAG, "Backend accept failed (${response.code()}), WorkManager will retry")
                            }
                        } catch (e: Exception) {
                            Log.w(TAG, "Network error on accept confirm, WorkManager will retry: ${e.message}")
                            // needsSync=true is already set — WorkManager handles the retry
                        }
                    } finally {
                        // CRITICAL: Must call finish() to release the wakelock held by goAsync()
                        pendingResult.finish()
                    }
                }

                // 3. Open the app to show order detail (fire-and-forget, doesn't need goAsync)
                val mainIntent = Intent(context, com.lancar.courier.ui.MainActivity::class.java).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                    putExtra("selected_order_id", orderId)
                }
                context.startActivity(mainIntent)
            }
        }
    }

    companion object {
        private const val TAG = "NotificationReceiver"
        const val ACTION_DISMISS = "com.lancar.courier.ACTION_DISMISS"
        const val ACTION_ACCEPT = "com.lancar.courier.ACTION_ACCEPT"
        const val EXTRA_NOTIFICATION_ID = "notification_id"
        const val EXTRA_ORDER_ID = "order_id"
        const val EXTRA_DISPATCH_ID = "dispatch_id"
        const val EXTRA_OFFER_EXPIRES_AT = "offer_expires_at"
        const val EXTRA_OFFER_TTL_SECONDS = "offer_ttl_seconds"
        const val EXTRA_PICKUP_ADDRESS = "pickup_address"
        const val EXTRA_PICKUP_TIME = "pickup_time"
        const val EXTRA_DROP_ADDRESS = "drop_address"
        const val EXTRA_DISTANCE = "distance"
        const val EXTRA_FEE = "fee"
        const val EXTRA_MODEL = "model"
        const val EXTRA_LEG_NUMBER = "leg_number"
        const val EXTRA_WORKFLOW_ROLE = "workflow_role"
        const val EXTRA_CUSTOMER_NAME = "customer_name"
        const val EXTRA_PHONE_NUMBER = "phone_number"
    }
}
