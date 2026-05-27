package com.lancar.customer.data.repository

import com.lancar.customer.data.api.TEMBUSApiService
import com.lancar.customer.data.model.*
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ChatRepository @Inject constructor(
    private val apiService: TEMBUSApiService
) {
    fun getOrderChats(orderId: String): Flow<Result<List<ChatMessage>>> = flow {
        try {
            val response = apiService.getOrderChats(orderId)
            val body = response.body()
            if (response.isSuccessful && body != null && body.success) {
                emit(Result.success(body.chats))
            } else {
                emit(Result.failure(Exception("Gagal memuat histori pesan")))
            }
        } catch (e: Exception) {
            emit(Result.failure(e))
        }
    }

    fun sendOrderChat(orderId: String, message: String): Flow<Result<ChatMessage>> = flow {
        try {
            val request = SendMessageRequest(message = message)
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
}
