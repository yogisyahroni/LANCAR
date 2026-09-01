package com.tembus.courier.ui.screens

internal fun offerRemainingSeconds(expiresAt: Long, now: Long): Int {
    val remainingMs = (expiresAt - now).coerceAtLeast(0L)
    return ((remainingMs + 999L) / 1000L).toInt()
}

internal fun offerCanAccept(expiresAt: Long, now: Long, acceptBlocked: Boolean): Boolean =
    !acceptBlocked && offerRemainingSeconds(expiresAt, now) > 0
