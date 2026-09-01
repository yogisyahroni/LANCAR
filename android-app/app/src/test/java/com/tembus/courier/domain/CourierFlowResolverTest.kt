package com.tembus.courier.domain

import com.tembus.courier.data.model.Order
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CourierFlowResolverTest {

    @Test
    fun `assigned order stays on navigation until arrival`() {
        val order = Order(orderId = "TMB-001", status = "assigned", workflowRole = "on_demand")

        val flow = CourierFlowResolver.resolve(
            order = order, 
            faceVerifiedForPickup = true, 
            pickupPhotoRequired = false
        )

        assertEquals(CourierStage.ASSIGNED, flow.stage)
        assertEquals(CourierNextActionType.NAVIGATE_TO_PICKUP, flow.nextAction.type)
        assertFalse(flow.pickupDone)
    }

    @Test
    fun `accepted order requires explicit arrival before pickup verification`() {
        val order = Order(orderId = "TMB-001A", status = "accepted", workflowRole = "on_demand")

        val flow = CourierFlowResolver.resolve(order, pickupPhotoRequired = true)

        assertEquals(CourierStage.GOING_TO_PICKUP, flow.stage)
        assertEquals(CourierNextActionType.MARK_PICKUP_ARRIVED, flow.nextAction.type)
        assertEquals("pickup_arrived", flow.nextAction.targetStatus)
    }

    @Test
    fun `scan done and required photo missing asks for pickup photo`() {
        val order = Order(orderId = "TMB-002", status = "pickup_arrived", workflowRole = "on_demand")

        val flow = CourierFlowResolver.resolve(
            order = order,
            faceVerifiedForPickup = true,
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
        val order = Order(orderId = "TMB-003", status = "pickup_arrived", workflowRole = "on_demand")

        val flow = CourierFlowResolver.resolve(
            order = order,
            faceVerifiedForPickup = true,
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
        val order = Order(orderId = "TMB-004", status = "in_transit", workflowRole = "on_demand")

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
