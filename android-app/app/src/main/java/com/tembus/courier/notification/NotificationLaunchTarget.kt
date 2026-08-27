package com.tembus.courier.notification

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
