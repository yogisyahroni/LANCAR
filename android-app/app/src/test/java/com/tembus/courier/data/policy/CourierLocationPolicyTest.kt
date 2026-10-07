package com.tembus.courier.data.policy

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CourierLocationPolicyTest {

    @Test
    fun resolvesOperationalStageWithActiveWorkPriority() {
        assertEquals(
            CourierLocationStage.IDLE_ON_DUTY,
            resolveCourierLocationStage(emptyList())
        )
        assertEquals(
            CourierLocationStage.PENDING_OFFER,
            resolveCourierLocationStage(listOf("pending_offer"))
        )
        assertEquals(
            CourierLocationStage.GOING_TO_PICKUP,
            resolveCourierLocationStage(listOf("assigned"))
        )
        assertEquals(
            CourierLocationStage.IN_TRANSIT,
            resolveCourierLocationStage(listOf("assigned", "in_transit"))
        )
    }

    @Test
    fun activeTransitUsesFasterAndMoreAccurateProfileThanIdle() {
        val idle = courierLocationProfile(CourierLocationStage.IDLE_ON_DUTY)
        val active = courierLocationProfile(CourierLocationStage.IN_TRANSIT)

        assertTrue(active.intervalMillis < idle.intervalMillis)
        assertTrue(active.minDistanceMeters < idle.minDistanceMeters)
        assertTrue(active.highAccuracy)
        assertTrue(!idle.highAccuracy)
    }
}
