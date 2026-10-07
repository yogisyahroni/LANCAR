package com.tembus.courier.data.policy

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LocationUploadPolicyTest {

    @Test
    fun coalescesSmallJitterButKeepsHeartbeatBounded() {
        assertTrue(
            shouldPersistLocation(
                distanceMeters = null,
                elapsedMillis = 0L,
                minDistanceMeters = 30f
            )
        )
        assertFalse(
            shouldPersistLocation(
                distanceMeters = 8f,
                elapsedMillis = 30_000L,
                minDistanceMeters = 30f
            )
        )
        assertTrue(
            shouldPersistLocation(
                distanceMeters = 8f,
                elapsedMillis = LOCATION_HEARTBEAT_MAX_SILENCE_MILLIS,
                minDistanceMeters = 30f
            )
        )
        assertTrue(
            shouldPersistLocation(
                distanceMeters = 40f,
                elapsedMillis = 5_000L,
                minDistanceMeters = 30f
            )
        )
    }
}
