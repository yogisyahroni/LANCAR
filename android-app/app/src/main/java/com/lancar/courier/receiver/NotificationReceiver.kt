package com.lancar.courier.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.app.NotificationManagerCompat
import com.lancar.courier.data.model.Order
import com.lancar.courier.data.repository.OrderRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * Notification Action Receiver
 *
 * Handles notification action buttons (dismiss, accept, etc.)
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
            }
            ACTION_ACCEPT -> {
                val orderId = intent.getStringExtra(EXTRA_ORDER_ID) ?: return
                Log.d("NotificationReceiver", "Order accepted: $orderId")

                // Parse order data from notification extras
                val pickupAddress = intent.getStringExtra(EXTRA_PICKUP_ADDRESS) ?: ""
                val pickupTime = intent.getStringExtra(EXTRA_PICKUP_TIME) ?: ""
                val dropAddress = intent.getStringExtra(EXTRA_DROP_ADDRESS) ?: ""
                val distance = intent.getStringExtra(EXTRA_DISTANCE) ?: ""
                val fee = intent.getStringExtra(EXTRA_FEE) ?: ""
                val customerName = intent.getStringExtra(EXTRA_CUSTOMER_NAME) ?: ""

                // Create order object and save to local database
                val order = Order(
                    orderId = orderId,
                    pickupAddress = pickupAddress,
                    pickupTime = pickupTime,
                    dropAddress = dropAddress,
                    distance = distance,
                    fee = fee,
                    customerName = customerName,
                    status = "accepted"
                )

                // Save to local database
                CoroutineScope(Dispatchers.IO).launch {
                    val orderRepository = OrderRepository(context)
                    orderRepository.addOrder(order)
                    Log.d("NotificationReceiver", "Order saved locally: $orderId")
                }

                // Launch MainActivity with order details
                val mainIntent = Intent(context, com.lancar.courier.ui.MainActivity::class.java).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                    putExtra("selected_order_id", orderId)
                }
                context.startActivity(mainIntent)
            }
        }
    }

    companion object {
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
    }
}
