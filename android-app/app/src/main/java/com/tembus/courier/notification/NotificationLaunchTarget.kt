package com.tembus.courier.notification

import com.tembus.courier.TEMBUSApplication

internal data class NotificationLaunchTarget(
    val openInbox: Boolean = false,
    val selectedOrderId: String? = null,
    val chatOrderId: String? = null,
)

internal fun notificationLaunchTarget(data: Map<String, String>): NotificationLaunchTarget {
    val type = data["type"] ?: "unknown"
    val orderId = data["order_id"] ?: data["orderId"]
    return when {
        data["open_inbox"] == "true" || type == "admin_broadcast" || type == "broadcast" -> {
            NotificationLaunchTarget(openInbox = true)
        }
        type == "chat_message" -> NotificationLaunchTarget(chatOrderId = orderId)
        orderId != null -> NotificationLaunchTarget(selectedOrderId = orderId)
        else -> NotificationLaunchTarget()
    }
}

internal fun notificationImageUrl(data: Map<String, String>): String? {
    val raw = data["image_url"] ?: data["imageUrl"] ?: data["image"] ?: return null
    val value = raw.trim()
    return value.takeIf { it.startsWith("https://") || it.startsWith("http://") }
}

internal fun notificationChannelId(data: Map<String, String>): String {
    val type = data["type"] ?: "unknown"
    if (type != "admin_broadcast" && type != "broadcast") return TEMBUSApplication.CHANNEL_ORDERS
    return when ((data["priority"] ?: "normal").trim().lowercase()) {
        "high", "urgent" -> TEMBUSApplication.CHANNEL_BROADCASTS_URGENT
        else -> TEMBUSApplication.CHANNEL_BROADCASTS
    }
}

