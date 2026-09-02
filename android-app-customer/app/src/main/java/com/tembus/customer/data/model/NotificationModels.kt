package com.tembus.customer.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

@Serializable
data class RegisterTokenRequest(
    @SerialName("device_token")
    val device_token: String,
    val platform: String = "android"
)

@Serializable
data class NotificationData(
    val id: String,
    val title: String,
    val body: String,
    val type: String,
    val category: String = "activity",
    val priority: String = "normal",
    @SerialName("is_read")
    val isRead: Boolean = false,
    @SerialName("read_at")
    val readAt: String? = null,
    @SerialName("archived_at")
    val archivedAt: String? = null,
    @SerialName("expires_at")
    val expiresAt: String? = null,
    @SerialName("created_at")
    val createdAt: String,
    @SerialName("order_id")
    val order_id: String? = null,
    @SerialName("conversation_id")
    val conversationId: String? = null,
    @SerialName("promo_id")
    val promoId: String? = null,
    val metadata: JsonElement? = null,
    @SerialName("deep_link")
    val deepLink: String? = null,
    @SerialName("service_code")
    val serviceCode: String? = null,
    @SerialName("event_version")
    val eventVersion: String? = null,
    val target: String? = null
)

@Serializable
data class NotificationRealtimeEvent(
    val id: String? = null,
    val title: String,
    val body: String,
    val type: String = "notification",
    val category: String = "activity",
    val priority: String = "normal",
    @SerialName("order_id")
    val orderId: String? = null,
    @SerialName("conversation_id")
    val conversationId: String? = null,
    @SerialName("promo_id")
    val promoId: String? = null,
    @SerialName("deep_link")
    val deepLink: String? = null,
    @SerialName("created_at")
    val createdAt: String? = null,
    @SerialName("service_code")
    val serviceCode: String? = null,
    @SerialName("event_version")
    val eventVersion: String? = null,
    val target: String? = null
)

@Serializable
data class NotificationListResponse(
    val success: Boolean = false,
    val data: List<NotificationData> = emptyList(),
    val notifications: List<NotificationData> = emptyList()
)

@Serializable
data class NotificationUnreadCountResponse(
    val success: Boolean = false,
    val data: NotificationUnreadCount = NotificationUnreadCount()
)

@Serializable
data class NotificationUnreadCount(
    val total: Int = 0,
    @SerialName("by_category")
    val byCategory: Map<String, Int> = emptyMap()
)

@Serializable
data class NotificationUpdateResponse(
    val success: Boolean = false,
    val data: JsonElement? = null,
    val message: String? = null
)
