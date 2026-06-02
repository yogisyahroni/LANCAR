package com.tembus.courier.domain

import com.tembus.courier.data.model.Order
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CourierFlowResolverTest {

    @Test
    fun `assigned order requires pickup scan first`() {
        val order = Order(orderId = "TMB-001", status = "assigned", workflowRole = "regular")

        val flow = CourierFlowResolver.resolve(order, pickupPhotoRequired = false)

        assertEquals(CourierStage.PICKUP_SCAN_REQUIRED, flow.stage)
        assertEquals(CourierNextActionType.SCAN_PICKUP, flow.nextAction.type)
        assertFalse(flow.pickupDone)
    }

    @Test
    fun `scan done and required photo missing asks for pickup photo`() {
        val order = Order(orderId = "TMB-002", status = "accepted", workflowRole = "on_demand")

        val flow = CourierFlowResolver.resolve(
            order = order,
            pickupScanVerified = true,
            pickupPhotoVerified = false,
            pickupPhotoRequired = true
        )

        assertEquals(CourierStage.PICKUP_PHOTO_REQUIRED, flow.stage)
        assertEquals(CourierNextActionType.CAPTURE_PICKUP_PHOTO, flow.nextAction.type)
        assertFalse(flow.pickupDone)
    }

    @Test
    fun `complete pickup evidence starts delivery`() {
        val order = Order(orderId = "TMB-003", status = "accepted", workflowRole = "on_demand")

        val flow = CourierFlowResolver.resolve(
            order = order,
            pickupScanVerified = true,
            pickupPhotoVerified = true,
            pickupPhotoRequired = true
        )

        assertEquals(CourierStage.PICKUP_VERIFIED, flow.stage)
        assertEquals(CourierNextActionType.START_DELIVERY, flow.nextAction.type)
        assertEquals("in_transit", flow.nextAction.targetStatus)
        assertTrue(flow.pickupDone)
    }

    @Test
    fun `in transit order asks for delivery proof`() {
        val order = Order(orderId = "TMB-004", status = "in_transit", workflowRole = "regular")

        val flow = CourierFlowResolver.resolve(order, pickupPhotoRequired = false)

        assertEquals(CourierStage.DELIVERY_POD_REQUIRED, flow.stage)
        assertEquals(CourierNextActionType.CAPTURE_DELIVERY_PROOF, flow.nextAction.type)
        assertFalse(flow.targetIsPickup)
    }

    @Test
    fun `delivered order has no next action`() {
        val order = Order(orderId = "TMB-005", status = "delivered", workflowRole = "on_demand")

        val flow = CourierFlowResolver.resolve(order)

        assertEquals(CourierStage.DELIVERED, flow.stage)
        assertEquals(CourierNextActionType.NONE, flow.nextAction.type)
        assertTrue(flow.deliveryDone)
    }
}
