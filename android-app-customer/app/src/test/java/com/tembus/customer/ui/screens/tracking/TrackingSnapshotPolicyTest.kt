package com.tembus.customer.ui.screens.tracking

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TrackingSnapshotPolicyTest {
    @Test
    fun delayedSnapshotCannotMoveTowingTimelineBackward() {
        assertFalse(shouldAcceptTrackingSnapshot("perjalanan", "inspeksi"))
        assertFalse(shouldAcceptTrackingSnapshot("selesai", "perjalanan"))
    }

    @Test
    fun equalAndForwardSnapshotsAreAccepted() {
        assertTrue(shouldAcceptTrackingSnapshot("perjalanan", "perjalanan"))
        assertTrue(shouldAcceptTrackingSnapshot("inspeksi", "loading"))
        assertTrue(shouldAcceptTrackingSnapshot(null, "menuju_pickup"))
    }

    @Test
    fun terminalCancellationCannotBeReplacedByOlderSuccess() {
        assertFalse(shouldAcceptTrackingSnapshot("dibatalkan", "selesai"))
    }

    @Test
    fun trackingPollIsSlowerWhileSearchingAndStopsAggressiveRefreshAfterTerminal() {
        assertTrue(trackingPollDelayMillis("searching", hasCourierLocation = false) > 5_000L)
        assertTrue(trackingPollDelayMillis("delivered", hasCourierLocation = true) > 5_000L)
        assertFalse(isTerminalTrackingStatus("in_transit"))
        assertTrue(isTerminalTrackingStatus("completed"))
    }
}
