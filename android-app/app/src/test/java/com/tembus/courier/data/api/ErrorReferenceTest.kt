package com.tembus.courier.data.api

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ErrorReferenceTest {
    @Test
    fun knownErrorAddsRecoveryAction() {
        val message = "Status ditolak.".withRecoverableNextAction("INVALID_TRANSITION")
        assertTrue(message.contains("Muat ulang status terbaru"))
    }

    @Test
    fun unknownErrorIsUnchanged() {
        assertEquals(
            "Terjadi masalah.",
            "Terjadi masalah.".withRecoverableNextAction("FUTURE_CODE")
        )
    }

    @Test
    fun repeatedRecoveryHintIsNotDuplicated() {
        val once = "Status ditolak.".withRecoverableNextAction("INVALID_TRANSITION")
        assertEquals(once, once.withRecoverableNextAction("INVALID_TRANSITION"))
    }
}
