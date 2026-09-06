package com.tembus.courier.domain

internal const val MAX_TAMBAL_BAN_SERVICE_DURATION_MINUTES = 24 * 60

internal fun calculateTambalBanDurationMinutes(
    startedAtMillis: Long?,
    completedAtMillis: Long
): Int? {
    val startedAt = startedAtMillis ?: return null
    if (startedAt <= 0L || completedAtMillis < startedAt) return null
    val elapsedMillis = completedAtMillis - startedAt
    val maxMillis = MAX_TAMBAL_BAN_SERVICE_DURATION_MINUTES * 60_000L
    if (elapsedMillis > maxMillis) return null
    return ((elapsedMillis + 59_999L) / 60_000L).coerceAtLeast(1L).toInt()
}
