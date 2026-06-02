package com.tembus.courier.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CourierRouteReducerTest {

    @Test
    fun `detail route keeps selected order id`() {
        val state = CourierRouteReducer.detail("TMB-001")

        assertEquals(CourierRouteScreen.ORDER_DETAIL, state.screen)
        assertEquals("TMB-001", state.orderId)
        assertTrue(state.hasOrderContext)
    }

    @Test
    fun `scan route normalizes scan type`() {
        val state = CourierRouteReducer.scan("TMB-002", "pickup")

        assertEquals(CourierRouteScreen.SCAN, state.screen)
        assertEquals(CourierProofTypes.PICKUP_SCAN, state.scanType)
    }

    @Test
    fun `proof route normalizes delivery proof mode`() {
        val state = CourierRouteReducer.proof("TMB-003", "pod")

        assertEquals(CourierRouteScreen.PROOF, state.screen)
        assertEquals(CourierProofTypes.DELIVERY_POD_PHOTO, state.proofMode)
    }

    @Test
    fun `child route with order returns to order detail`() {
        val state = CourierRouteReducer.chat("TMB-004")

        val next = CourierRouteReducer.backFromChild(state)

        assertEquals(CourierRouteScreen.ORDER_DETAIL, next.screen)
        assertEquals("TMB-004", next.orderId)
    }

    @Test
    fun `child route without order returns home`() {
        val state = CourierRouteReducer.scan(null)

        val next = CourierRouteReducer.backFromChild(state)

        assertEquals(CourierRouteScreen.HOME, next.screen)
        assertFalse(next.hasOrderContext)
    }
}
