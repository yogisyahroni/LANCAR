package com.tembus.courier.ui.screens

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CourierWorkStateTest {
    @Test
    fun onlinePresenceDoesNotImplyRecoveredWorkSnapshot() {
        assertFalse(isCourierSnapshotRecovered(null, false))
        assertFalse(isCourierSnapshotRecovered(100L, true))
        assertTrue(isCourierSnapshotRecovered(100L, false))
    }

    @Test
    fun activeJobCannotBeAcceptedBeyondServerAdvertisedCapacity() {
        assertFalse(canAcceptCourierWork(true, activeJobCount = 1, maxActiveJobs = 1))
        assertTrue(canAcceptCourierWork(true, activeJobCount = 0, maxActiveJobs = 1))
        assertFalse(canAcceptCourierWork(false, activeJobCount = 0, maxActiveJobs = 1))
    }

    @Test
    fun presenceStatesRemainExplicitForCourierSurface() {
        assertTrue(presenceStateLabel("break") == "Break")
        assertTrue(presenceStateLabel("limited") == "Limited")
        assertTrue(presenceStateLabel("unavailable") == "Tidak tersedia")
        assertTrue(presenceStateMessage("break").contains("dijeda"))
    }
}
