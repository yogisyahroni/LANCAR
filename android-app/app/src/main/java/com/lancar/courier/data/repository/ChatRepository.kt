package com.lancar.courier.data.repository

import com.lancar.courier.data.api.LANCARApiService
import com.lancar.courier.data.model.ChatMessage
import com.lancar.courier.data.model.SendMessageRequest
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ChatRepository @Inject constructor(
    private val apiService: LANCARApiService
) {
    /**
     * Load past conversation blocks for specific delivery assignment.
     */
    fun getOrderChats(orderId: String): Flow<Result<List<ChatMessage>>> = flow {
        try {
            val response = apiService.getOrderChats(orderId)
            if (response.isSuccessful && response.body()?.success == true) {
                val body = response.body()
                emit(Result.success(body?.chats ?: body?.data ?: emptyList()))
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
            val response = apiService.sendOrderChat(orderId, SendMessageRequest(messageText))
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
}
