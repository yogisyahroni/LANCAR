package com.tembus.merchant.ui.screens.home

import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PrepTimerTest {
    private val accepted = "2026-08-31T10:00:00Z"
    private val deadline = "2026-08-31T10:15:00Z"

    @Test
    fun derivesRemainingTimeFromServerDeadline() {
        val state = prepTimerState(Instant.parse("2026-08-31T10:05:30Z"), accepted, deadline)
        assertEquals(570L, state.remainingSeconds)
        assertFalse(state.isOverdue)
        assertTrue(state.hasSchedule)
    }

    @Test
    fun reportsOverdueWithoutNegativeCountdown() {
        val state = prepTimerState(Instant.parse("2026-08-31T10:16:00Z"), accepted, deadline)
        assertEquals(0L, state.remainingSeconds)
        assertTrue(state.isOverdue)
    }

    @Test
    fun ignoresMissingOrMalformedServerTimestamps() {
        assertFalse(prepTimerState(Instant.EPOCH, null, deadline).hasSchedule)
        assertFalse(prepTimerState(Instant.EPOCH, accepted, "not-a-timestamp").hasSchedule)
    }
}
