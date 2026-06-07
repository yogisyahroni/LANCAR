package com.tembus.courier.data.repository

import com.tembus.courier.data.api.TEMBUSApiService
import com.tembus.courier.data.model.ChatMessage
import com.tembus.courier.data.model.ConversationInfo
import com.tembus.courier.data.model.ReadReceiptRequest
import com.tembus.courier.data.model.SendMessageRequest
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

data class ChatHistory(
    val messages: List<ChatMessage>,
    val conversation: ConversationInfo?
)

@Singleton
class ChatRepository @Inject constructor(
    private val apiService: TEMBUSApiService
) {
    /**
     * Load past conversation blocks for specific delivery assignment.
     */
    fun getOrderChats(orderId: String): Flow<Result<ChatHistory>> = flow {
        try {
            val response = apiService.getOrderChats(orderId)
            if (response.isSuccessful && response.body()?.success == true) {
                val body = response.body()
                emit(Result.success(ChatHistory(body?.chats ?: body?.data ?: emptyList(), body?.conversation)))
            } else {
                emit(Result.failure(Exception(response.body()?.message ?: "Gagal memuat percakapan")))
            }
        } catch (e: Exception) {
            emit(Result.failure(e))
        }
    }

    /**
     * Dispatches user message to database and broadcasts via WebSocket sync gateway.
     */
    fun sendOrderChat(orderId: String, messageText: String): Flow<Result<ChatMessage>> = flow {
        try {
            val response = apiService.sendOrderChat(
                orderId,
                SendMessageRequest(
                    message = messageText,
                    clientMessageId = UUID.randomUUID().toString()
                )
            )
            val body = response.body()
            val messageData = body?.chat ?: body?.data
            if (response.isSuccessful && response.body()?.success == true && messageData != null) {
                emit(Result.success(messageData))
            } else {
                emit(Result.failure(Exception(response.body()?.message ?: "Gagal mengirim pesan")))
            }
        } catch (e: Exception) {
            emit(Result.failure(e))
        }
    }

    suspend fun markOrderChatRead(orderId: String, lastMessageId: String?) {
        runCatching {
            apiService.markOrderConversationRead(
                id = orderId,
                request = ReadReceiptRequest(lastMessageId = lastMessageId)
            )
        }
    }
}
