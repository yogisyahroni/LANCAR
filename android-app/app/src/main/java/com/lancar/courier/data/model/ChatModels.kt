package com.lancar.courier.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class ChatResponse(
    @SerialName("success")
    val success: Boolean,
    @SerialName("data")
    val data: List<ChatMessage> = emptyList(),
    @SerialName("message")
    val message: String? = null
)

@Serializable
data class ChatMessage(
    @SerialName("id")
    val id: String? = null,
    @SerialName("order_id")
    val orderId: String,
    @SerialName("sender_id")
    val senderId: String,
    @SerialName("message_text")
    val messageText: String,
    @SerialName("message_type")
    val messageType: String = "text",
    @SerialName("created_at")
    val createdAt: String
)

@Serializable
data class SendMessageRequest(
    @SerialName("messageText")
    val messageText: String
)

@Serializable
data class SendMessageResponse(
    @SerialName("success")
    val success: Boolean,
    @SerialName("data")
    val data: ChatMessage? = null,
    @SerialName("message")
    val message: String? = null
)
