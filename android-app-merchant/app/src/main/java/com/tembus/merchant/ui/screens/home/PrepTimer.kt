package com.tembus.merchant.ui.screens.home

import java.time.Duration
import java.time.Instant

data class PrepTimerState(
    val remainingSeconds: Long,
    val isOverdue: Boolean,
    val hasSchedule: Boolean,
)

/**
 * Derives the preparation countdown from server timestamps. Keeping this
 * calculation pure makes the UI honest when the device clock or network
 * refreshes: no locally invented start time is used.
 */
internal fun prepTimerState(
    now: Instant,
    acceptedAt: String?,
    readyAt: String?,
): PrepTimerState {
    val deadline = parseInstant(readyAt) ?: return PrepTimerState(0, false, false)
    val accepted = parseInstant(acceptedAt)
    if (accepted == null) return PrepTimerState(0, false, false)

    val seconds = Duration.between(now, deadline).seconds
    return PrepTimerState(
        remainingSeconds = seconds.coerceAtLeast(0),
        isOverdue = seconds < 0,
        hasSchedule = true,
    )
}

private fun parseInstant(value: String?): Instant? =
    value?.trim()?.takeIf { it.isNotEmpty() }?.let {
        runCatching { Instant.parse(it) }.getOrNull()
    }

internal fun formatPrepCountdown(remainingSeconds: Long): String {
    val minutes = remainingSeconds / 60
    val seconds = remainingSeconds % 60
    return "%02d:%02d".format(minutes, seconds)
}
