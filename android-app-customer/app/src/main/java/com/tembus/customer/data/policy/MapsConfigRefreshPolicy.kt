package com.tembus.customer.data.policy

private const val MIN_MAPS_CONFIG_TTL_SECONDS = 30
private const val MAX_MAPS_CONFIG_TTL_SECONDS = 3_600
private const val FAILED_REFRESH_RETRY_DELAY_MS = 30_000L

internal fun mapsProviderConfigRefreshIntervalMillis(ttlSeconds: Int): Long =
    ttlSeconds
        .coerceIn(MIN_MAPS_CONFIG_TTL_SECONDS, MAX_MAPS_CONFIG_TTL_SECONDS)
        .times(1_000L)

/**
 * Prevents a failed config request from becoming a request-per-poll loop.
 * Successful responses follow the server-provided TTL; failures retry at a
 * bounded interval while the last known config remains usable.
 */
internal fun shouldRefreshMapsProviderConfig(
    nowMillis: Long,
    lastSuccessfulAtMillis: Long,
    lastAttemptAtMillis: Long,
    ttlSeconds: Int,
    force: Boolean = false,
): Boolean {
    if (force) return true

    val refreshIntervalMillis = mapsProviderConfigRefreshIntervalMillis(ttlSeconds)
    if (lastSuccessfulAtMillis > 0L && nowMillis - lastSuccessfulAtMillis < refreshIntervalMillis) {
        return false
    }

    val retryDelayMillis = minOf(FAILED_REFRESH_RETRY_DELAY_MS, refreshIntervalMillis)
    return lastAttemptAtMillis <= 0L || nowMillis - lastAttemptAtMillis >= retryDelayMillis
}
