package com.tembus.customer.ui.screens.service

import com.tembus.customer.data.model.NearbyCourier
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RoadsidePreferredCourierPolicyTest {
    private fun courier(id: String, status: String) = NearbyCourier(
        courierId = id,
        courierName = "Teknisi $id",
        status = status
    )

    @Test
    fun `preferred courier remains valid when refreshed candidate is available`() {
        assertTrue(
            isPreferredRoadsideCourierAvailable(
                "courier-1",
                listOf(courier("courier-1", "available"))
            ) == true
        )
    }

    @Test
    fun `conditional candidate remains selectable when backend still declares it eligible`() {
        assertEquals(
            true,
            isPreferredRoadsideCourierAvailable(
                "courier-1",
                listOf(courier("courier-1", "conditional"))
            )
        )
    }

    @Test
    fun `missing or unavailable preferred courier is rejected after location refresh`() {
        assertFalse(
            isPreferredRoadsideCourierAvailable(
                "courier-1",
                listOf(courier("courier-2", "available"), courier("courier-1", "offline"))
            ) ?: true
        )
    }

    @Test
    fun `no preferred courier does not create a false validation failure`() {
        assertNull(isPreferredRoadsideCourierAvailable(null, emptyList()))
    }
}
