package com.tembus.merchant.data.printer

/**
 * FOOD-2026-025: small durable-in-memory print queue policy. The order/KDS
 * state remains server authoritative; printing is an isolated side effect.
 */
enum class PrintJobState { QUEUED, PRINTING, SUCCEEDED, FAILED }

data class PrintJob(val id: String, val attempts: Int = 0, val state: PrintJobState = PrintJobState.QUEUED, val lastError: String? = null)

object PrintQueuePolicy {
    const val MAX_ATTEMPTS = 3

    fun start(job: PrintJob): PrintJob = job.copy(state = PrintJobState.PRINTING, attempts = job.attempts + 1)
    fun success(job: PrintJob): PrintJob = job.copy(state = PrintJobState.SUCCEEDED, lastError = null)
    fun failure(job: PrintJob, error: String): PrintJob = job.copy(
        state = if (job.attempts >= MAX_ATTEMPTS) PrintJobState.FAILED else PrintJobState.QUEUED,
        lastError = error
    )

    /** Exponential backoff, capped so a dead printer cannot stall the UI. */
    fun retryDelayMs(attempt: Int): Long = (500L shl (attempt.coerceIn(1, 3) - 1)).coerceAtMost(2_000L)
}
