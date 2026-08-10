package com.tembus.merchant.data.repository

import com.tembus.merchant.data.api.TEMBUSApiService
import com.tembus.merchant.data.model.ChatMessage
import com.tembus.merchant.data.model.ChatResponse
import com.tembus.merchant.data.model.ConversationInfo
import com.tembus.merchant.data.model.ReadReceiptRequest
import com.tembus.merchant.data.model.SendMessageRequest
import com.tembus.merchant.data.model.SuccessResponse
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow

/**
 * ChatRepository (FB-119) — chat customer↔merchant per order.
 * Endpoint: /api/v1/mobile/chats/orders/{id}/... (admin-service, sama
 * dengan yang dipakai customer/courier).
 */
class ChatRepository(private val api: TEMBUSApiService) {

    data class ChatHistory(
        val messages: List<ChatMessage>,
        val conversation: ConversationInfo?
    )

    fun getOrderChats(orderId: String): Flow<Result<ChatHistory>> = flow {
        try {
            val resp = api.getOrderChats(orderId)
            if (resp.isSuccessful && resp.body()?.success == true) {
                val body = resp.body()!!
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
            val resp = api.sendOrderChat(
                orderId,
                SendMessageRequest(message = message, clientMessageId = clientMessageId)
            )
            if (resp.isSuccessful && resp.body()?.success == true && resp.body()?.chat != null) {
                emit(Result.success(resp.body()!!.chat!!))
            } else {
                emit(Result.failure(Exception("Gagal mengirim pesan")))
            }
        } catch (e: Exception) {
            emit(Result.failure(e))
        }
    }

    suspend fun markOrderChatRead(orderId: String, lastMessageId: String?) {
        runCatching {
            api.markOrderConversationRead(orderId, ReadReceiptRequest(lastMessageId = lastMessageId))
        }
    }
}
