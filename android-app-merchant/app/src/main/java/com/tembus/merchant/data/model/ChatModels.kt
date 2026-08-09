package com.tembus.merchant.data.model

import com.google.gson.annotations.SerializedName

/**
 * Model chat order — FB-119: merchant bisa chat dengan customer
 * sebelum/selama proses masak (endpoint sama dengan customer/courier,
 * role 'merchant' di-allow backend via orderCommunication.ts).
 */

data class ChatResponse(
    @SerializedName("success") val success: Boolean,
    @SerializedName("chats") val chats: List<ChatMessage> = emptyList(),
    @SerializedName("conversation") val conversation: ConversationInfo? = null,
    @SerializedName("read_receipts") val readReceipts: List<ReadReceipt> = emptyList()
)

data class ChatMessage(
    @SerializedName("id") val id: String? = null,
    @SerializedName("order_id") val orderId: String? = null,
    @SerializedName("sender_id") val senderId: String,
    @SerializedName("sender_name") val senderName: String? = null,
    @SerializedName("sender_role") val senderRole: String? = null,
    @SerializedName("message") val message: String,
    @SerializedName("message_type") val messageType: String = "text",
    @SerializedName("created_at") val createdAt: String? = null
)

data class SendMessageRequest(
    @SerializedName("message") val message: String,
    @SerializedName("message_type") val messageType: String = "text",
    @SerializedName("client_message_id") val clientMessageId: String? = null
)

data class SendMessageResponse(
    @SerializedName("success") val success: Boolean,
    @SerializedName("chat") val chat: ChatMessage? = null
)

data class ConversationInfo(
    @SerializedName("id") val id: String? = null,
    @SerializedName("order_id") val orderId: String? = null,
    @SerializedName("member_type") val memberType: String? = null,
    @SerializedName("phase") val phase: String? = null,
    @SerializedName("is_group") val isGroup: Boolean = false,
    @SerializedName("participant_count") val participantCount: Int = 0,
    @SerializedName("recipient_joined") val recipientJoined: Boolean = false,
    @SerializedName("visibility_notice") val visibilityNotice: String? = null
)

data class ReadReceiptRequest(
    @SerializedName("last_message_id") val lastMessageId: String? = null
)

data class ReadReceipt(
    @SerializedName("member_type") val memberType: String? = null,
    @SerializedName("member_id") val memberId: String? = null,
    @SerializedName("last_message_id") val lastMessageId: String? = null,
    @SerializedName("read_at") val readAt: String? = null
)
