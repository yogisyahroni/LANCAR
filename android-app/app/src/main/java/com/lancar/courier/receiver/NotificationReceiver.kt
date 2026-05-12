package com.lancar.courier.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.app.NotificationManagerCompat
import com.lancar.courier.data.api.ApiClient
import com.lancar.courier.data.model.Order
import com.lancar.courier.data.model.StatusUpdateRequest
import com.lancar.courier.data.repository.OrderRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * Notification Action Receiver
 *
 * Handles notification action buttons (dismiss, accept).
 * On accept:
 *   1. Save order to local Room DB (offline-first)
 *   2. Confirm acceptance to backend via API
 *   3. If backend fails → needsSync=true, WorkManager will retry
 */
class NotificationReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return

        when (action) {
            ACTION_DISMISS -> {
                val notificationId = intent.getIntExtra(EXTRA_NOTIFICATION_ID, -1)
                if (notificationId != -1) {
                    NotificationManagerCompat.from(context).cancel(notificationId)
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
                    customerName = intent.getStringExtra(EXTRA_CUSTOMER_NAME) ?: "",
                    phoneNumber = intent.getStringExtra(EXTRA_PHONE_NUMBER),
                    status = "accepted",
                    needsSync = true // mark for backend confirmation
                )

                CoroutineScope(Dispatchers.IO).launch {
                    val orderRepository = OrderRepository(context)

                    // 1. Save locally first (offline-first guarantee)
                    orderRepository.addOrder(order)
                    Log.d(TAG, "Order saved locally: $orderId")

                    // 2. Confirm acceptance to backend immediately
                    try {
                        val response = ApiClient.apiService.updateStatus(
                            StatusUpdateRequest(
                                orderId = orderId,
                                status = "accepted",
                                notes = null
                            )
                        )
                        if (response.isSuccessful && response.body()?.success == true) {
                            // Mark as synced — no need for WorkManager retry
                            val saved = orderRepository.getOrderById(orderId)
                            if (saved != null) {
                                orderRepository.updateOrder(saved.copy(needsSync = false))
                            }
                            Log.d(TAG, "Order acceptance confirmed to backend: $orderId")
                        } else {
                            Log.w(TAG, "Backend accept failed (${response.code()}), WorkManager will retry")
                        }
                    } catch (e: Exception) {
                        Log.w(TAG, "Network error on accept confirm, WorkManager will retry: ${e.message}")
                        // needsSync=true is already set — WorkManager handles the retry
                    }
                }

                // 3. Open the app to show order detail
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
        const val EXTRA_PICKUP_ADDRESS = "pickup_address"
        const val EXTRA_PICKUP_TIME = "pickup_time"
        const val EXTRA_DROP_ADDRESS = "drop_address"
        const val EXTRA_DISTANCE = "distance"
        const val EXTRA_FEE = "fee"
        const val EXTRA_CUSTOMER_NAME = "customer_name"
        const val EXTRA_PHONE_NUMBER = "phone_number"
    }
}
