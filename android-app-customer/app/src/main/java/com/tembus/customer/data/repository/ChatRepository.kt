package com.tembus.customer.data.repository

import com.tembus.customer.data.api.TEMBUSApiService
import com.tembus.customer.data.model.*
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
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
    fun getOrderChats(orderId: String): Flow<Result<ChatHistory>> = flow {
        try {
            val response = apiService.getOrderChats(orderId)
            val body = response.body()
            if (response.isSuccessful && body != null && body.success) {
                emit(Result.success(ChatHistory(body.chats, body.conversation)))
            } else {
                emit(Result.failure(Exception("Gagal memuat histori pesan")))
            }
        } catch (e: Exception) {
            emit(Result.failure(e))
        }
    }

    fun sendOrderChat(orderId: String, message: String, clientMessageId: String): Flow<Result<ChatMessage>> = flow {
        try {
            val request = SendMessageRequest(message = message, clientMessageId = clientMessageId)
            val response = apiService.sendOrderChat(orderId, request)
            val body = response.body()
            if (response.isSuccessful && body != null && body.success && body.chat != null) {
                emit(Result.success(body.chat))
            } else {
                emit(Result.failure(Exception("Gagal mengirim pesan")))
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
