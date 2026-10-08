package com.tembus.customer.ui.screens.tracking

private const val ACTIVE_TRACKING_POLL_INTERVAL_MS = 5_000L
private const val SEARCHING_TRACKING_POLL_INTERVAL_MS = 10_000L
private const val NO_LOCATION_TRACKING_POLL_INTERVAL_MS = 7_500L
private const val TERMINAL_TRACKING_POLL_INTERVAL_MS = 60_000L

internal fun trackingPollDelayMillis(
    status: String?,
    hasCourierLocation: Boolean,
): Long {
    val normalizedStatus = status?.trim()?.lowercase().orEmpty()
    if (normalizedStatus in TERMINAL_TRACKING_STATUSES) return TERMINAL_TRACKING_POLL_INTERVAL_MS

    return when {
        normalizedStatus in SEARCHING_TRACKING_STATUSES -> SEARCHING_TRACKING_POLL_INTERVAL_MS
        hasCourierLocation -> ACTIVE_TRACKING_POLL_INTERVAL_MS
        else -> NO_LOCATION_TRACKING_POLL_INTERVAL_MS
    }
}

internal fun isTerminalTrackingStatus(status: String?): Boolean =
    status?.trim()?.lowercase() in TERMINAL_TRACKING_STATUSES

private val SEARCHING_TRACKING_STATUSES = setOf(
    "pending",
    "pending_merchant",
    "searching",
    "searching_driver",
    "mencari_kurir",
)

private val TERMINAL_TRACKING_STATUSES = setOf(
    "cancelled",
    "canceled",
    "failed",
    "delivered",
    "completed",
)
