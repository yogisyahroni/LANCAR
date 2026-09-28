package com.tembus.customer.ui.screens.main

import com.tembus.customer.data.model.Order
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ActiveOrderRecoveryPolicyTest {
    @Test
    fun recoverableOrders_keepsActiveOrderAfterProcessDeathRecovery() {
        val active = Order(orderId = "active-1", status = "in_transit")
        val pending = Order(orderId = "pending-1", status = "pending_payment")
        val recovered = ActiveOrderRecoveryPolicy.recoverableOrders(listOf(active, pending))

        assertEquals(listOf("active-1", "pending-1"), recovered.map { it.orderId })
    }

    @Test
    fun recoverableOrders_excludesTerminalAndCancelledOrders() {
        val orders = listOf(
            Order(orderId = "done", status = "delivered"),
            Order(orderId = "pod-done", status = "pod_completed"),
            Order(orderId = "cancelled", status = "cancelled"),
            Order(orderId = "failed", status = "payment_failed"),
            Order(orderId = "no-supply", status = "no_courier_found"),
            Order(orderId = "still-active", status = "accepted"),
            Order(orderId = "arrived-active", status = "arrived"),
        )

        val recovered = ActiveOrderRecoveryPolicy.recoverableOrders(orders)

        assertEquals(listOf("still-active", "arrived-active"), recovered.map { it.orderId })
        assertTrue(recovered.none { it.status == "delivered" })
        assertTrue(recovered.none { it.status == "pod_completed" })
    }
}
