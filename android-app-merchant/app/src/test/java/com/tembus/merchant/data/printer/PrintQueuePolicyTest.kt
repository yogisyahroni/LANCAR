package com.tembus.merchant.data.printer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PrintQueuePolicyTest {
    @Test
    fun `printer failures retry and isolate until terminal failure`() {
        var job = PrintJob("order-1")
        repeat(PrintQueuePolicy.MAX_ATTEMPTS) {
            job = PrintQueuePolicy.start(job)
            job = PrintQueuePolicy.failure(job, "offline")
        }
        assertEquals(PrintJobState.FAILED, job.state)
        assertEquals(PrintQueuePolicy.MAX_ATTEMPTS, job.attempts)
        assertEquals("offline", job.lastError)
    }

    @Test
    fun `successful print stops retry and backoff is bounded`() {
        var job = PrintQueuePolicy.start(PrintJob("order-2"))
        job = PrintQueuePolicy.success(job)
        assertEquals(PrintJobState.SUCCEEDED, job.state)
        assertEquals(500L, PrintQueuePolicy.retryDelayMs(1))
        assertTrue(PrintQueuePolicy.retryDelayMs(99) <= 2_000L)
    }
}
