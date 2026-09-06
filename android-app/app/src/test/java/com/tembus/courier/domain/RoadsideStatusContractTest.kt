package com.tembus.courier.domain

import org.junit.Assert.assertEquals
import org.junit.Test

class RoadsideStatusContractTest {
    @Test
    fun localTambalBanStatesMapToCanonicalServerLifecycle() {
        assertEquals("accepted", canonicalTambalBanStatus("arriving"))
        assertEquals("pickup_arrived", canonicalTambalBanStatus("arrived"))
        assertEquals("picking_up", canonicalTambalBanStatus("verifying"))
        assertEquals("picked_up", canonicalTambalBanStatus("in_progress"))
        assertEquals("delivering", canonicalTambalBanStatus("service_complete"))
        assertEquals("delivered", canonicalTambalBanStatus("completed"))
    }

    @Test
    fun canonicalAndUnknownStatesRemainNormalizedWithoutInventingProgress() {
        assertEquals("picked_up", canonicalTambalBanStatus(" PICKED_UP "))
        assertEquals("future_state", canonicalTambalBanStatus(" Future_State "))
    }
}
