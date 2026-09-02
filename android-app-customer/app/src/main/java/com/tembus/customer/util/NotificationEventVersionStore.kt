package com.tembus.customer.util

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Keeps the newest server event version seen per order on this device.
 * Pushes are hints only; order screens still fetch the authoritative snapshot.
 */
@Singleton
class NotificationEventVersionStore @Inject constructor(
    @ApplicationContext context: Context
) {
    private val preferences = context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

    @Synchronized
    fun accept(orderId: String?, eventVersion: String?): Boolean {
        val id = orderId?.trim().orEmpty()
        val version = eventVersion?.trim()?.toLongOrNull()
        if (id.isBlank() || version == null) return true

        val key = "order_event_version_${id.take(MAX_ORDER_ID_LENGTH)}"
        val previous = preferences.getLong(key, Long.MIN_VALUE).takeIf { it != Long.MIN_VALUE }
        if (!shouldAcceptNotificationEventVersion(previous, eventVersion)) return false

        preferences.edit().putLong(key, version).apply()
        return true
    }

    private companion object {
        const val PREFERENCES_NAME = "notification_event_versions"
        const val MAX_ORDER_ID_LENGTH = 128
    }
}

internal fun shouldAcceptNotificationEventVersion(previous: Long?, incoming: String?): Boolean {
    val version = incoming?.trim()?.toLongOrNull() ?: return true
    return previous == null || version > previous
}
