package com.tembus.customer.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class ChatResponse(
    @SerialName("success") val success: Boolean,
    @SerialName("chats") val chats: List<ChatMessage> = emptyList(),
    @SerialName("conversation") val conversation: ConversationInfo? = null,
    @SerialName("read_receipts") val readReceipts: List<ReadReceipt> = emptyList()
)

@Serializable
data class ChatMessage(
    @SerialName("id") val id: String? = null,
    @SerialName("order_id") val orderId: String? = null,
    @SerialName("sender_id") val senderId: String,
    @SerialName("sender_name") val senderName: String? = null,
    @SerialName("sender_role") val senderRole: String? = null,
    @SerialName("message") val message: String,
    @SerialName("message_type") val messageType: String = "text",
    @SerialName("created_at") val createdAt: String? = null
)

@Serializable
data class SendMessageRequest(
    @SerialName("message") val message: String,
    @SerialName("message_type") val messageType: String = "text",
    @SerialName("client_message_id") val clientMessageId: String? = null
)

@Serializable
data class SendMessageResponse(
    @SerialName("success") val success: Boolean,
    @SerialName("chat") val chat: ChatMessage? = null
)
