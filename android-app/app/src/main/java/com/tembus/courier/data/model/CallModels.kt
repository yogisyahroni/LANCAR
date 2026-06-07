package com.tembus.courier.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class ConversationInfo(
    @SerialName("id") val id: String? = null,
    @SerialName("order_id") val orderId: String? = null,
    @SerialName("member_type") val memberType: String? = null,
    @SerialName("phase") val phase: String? = null,
    @SerialName("is_group") val isGroup: Boolean = false,
    @SerialName("participant_count") val participantCount: Int = 0,
    @SerialName("recipient_joined") val recipientJoined: Boolean = false,
    @SerialName("can_call_customer") val canCallCustomer: Boolean = false,
    @SerialName("can_call_courier") val canCallCourier: Boolean = false,
    @SerialName("can_call_recipient") val canCallRecipient: Boolean = false,
    @SerialName("visibility_notice") val visibilityNotice: String? = null
)

@Serializable
data class ReadReceiptRequest(
    @SerialName("last_message_id") val lastMessageId: String? = null
)

@Serializable
data class ReadReceiptResponse(
    @SerialName("success") val success: Boolean,
    @SerialName("receipt") val receipt: ReadReceipt? = null,
    @SerialName("conversation") val conversation: ConversationInfo? = null,
    @SerialName("error") val error: String? = null
)

@Serializable
data class ReadReceipt(
    @SerialName("member_type") val memberType: String? = null,
    @SerialName("member_id") val memberId: String? = null,
    @SerialName("last_message_id") val lastMessageId: String? = null,
    @SerialName("read_at") val readAt: String? = null
)

@Serializable
data class CreateCallRequest(
    @SerialName("target_type") val targetType: String = "customer"
)

@Serializable
data class JoinCallRequest(
    @SerialName("call_token") val callToken: String
)

@Serializable
data class EndCallRequest(
    @SerialName("status") val status: String = "ended"
)

@Serializable
data class CallResponse(
    @SerialName("success") val success: Boolean,
    @SerialName("call") val call: CallSession? = null,
    @SerialName("conversation") val conversation: ConversationInfo? = null,
    @SerialName("error") val error: String? = null
)

@Serializable
data class CallSession(
    @SerialName("id") val id: String,
    @SerialName("order_id") val orderId: String,
    @SerialName("conversation_id") val conversationId: String? = null,
    @SerialName("caller_id") val callerId: String? = null,
    @SerialName("target_id") val targetId: String? = null,
    @SerialName("target_type") val targetType: String? = null,
    @SerialName("status") val status: String? = null,
    @SerialName("call_token") val callToken: String? = null,
    @SerialName("expires_at") val expiresAt: String? = null,
    @SerialName("ice_servers") val iceServers: List<IceServerConfig> = emptyList()
)

@Serializable
data class IceServerConfig(
    @SerialName("urls") val urls: List<String> = emptyList(),
    @SerialName("username") val username: String? = null,
    @SerialName("credential") val credential: String? = null
)

data class CallSignalEvent(
    val event: String,
    val orderId: String,
    val callId: String,
    val senderId: String? = null,
    val callerName: String? = null,
    val callToken: String? = null,
    val sdp: String? = null,
    val sdpMid: String? = null,
    val sdpMLineIndex: Int = 0,
    val candidate: String? = null,
    val status: String? = null
)
