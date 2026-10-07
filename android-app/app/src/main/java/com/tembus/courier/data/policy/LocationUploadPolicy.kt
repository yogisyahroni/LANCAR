package com.tembus.courier.data.policy

const val LOCATION_HEARTBEAT_MAX_SILENCE_MILLIS = 60_000L

/**
 * Coalesces tiny GPS jitter while guaranteeing that the server heartbeat is
 * refreshed at least once per bounded silence window.
 */
fun shouldPersistLocation(
    distanceMeters: Float?,
    elapsedMillis: Long,
    minDistanceMeters: Float,
    maxSilenceMillis: Long = LOCATION_HEARTBEAT_MAX_SILENCE_MILLIS,
): Boolean {
    if (distanceMeters == null || elapsedMillis < 0L) return true
    return distanceMeters >= minDistanceMeters || elapsedMillis >= maxSilenceMillis
}
