package com.tembus.courier.data.model

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CourierHotspotTest {

    @Test
    fun `hotspot requires server evidence before display`() {
        val incomplete = CourierHotspot(
            id = "zone-1",
            name = "Zona uji",
            pendingOrders = 69,
            demandScore = 90,
            recentOrders = 4
        )

        assertFalse(incomplete.hasServerDemandEvidence)
        assertTrue(incomplete.hasDemandSignal)
    }

    @Test
    fun `empty server snapshot is not presented as an active opportunity`() {
        val empty = CourierHotspot(
            id = "zone-1",
            name = "Zona uji",
            demandEstimate = true,
            demandSource = "server_demand_rollup",
            freshness = "fresh",
            refreshedAt = "2026-10-07T00:00:00Z"
        )

        assertTrue(empty.hasServerDemandEvidence)
        assertFalse(empty.hasDemandSignal)
    }
}
