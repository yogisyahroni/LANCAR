package com.tembus.customer.ui.screens.main

import com.tembus.customer.data.model.Order

/**
 * Keeps dashboard recovery server-first while allowing the encrypted Room
 * cache to render the last known active order when the API is unavailable.
 */
object ActiveOrderRecoveryPolicy {
    private val terminalStatuses = setOf(
        "delivered",
        "completed",
        "cancelled",
        "canceled",
        "failed",
        "rejected",
        "payment_failed",
        "no courier found",
        "no_courier_found",
    )

    fun recoverableOrders(orders: List<Order>): List<Order> = orders.filter { order ->
        val status = order.status.trim().lowercase()
        status !in terminalStatuses && !status.contains("cancel")
    }
}
