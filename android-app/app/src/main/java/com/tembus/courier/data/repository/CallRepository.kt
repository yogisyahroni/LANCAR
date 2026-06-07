package com.tembus.courier.data.repository

import com.tembus.courier.data.api.TEMBUSApiService
import com.tembus.courier.data.model.CallSession
import com.tembus.courier.data.model.CreateCallRequest
import com.tembus.courier.data.model.EndCallRequest
import com.tembus.courier.data.model.JoinCallRequest
import com.tembus.courier.data.model.ReadReceiptRequest
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class CallRepository @Inject constructor(
    private val apiService: TEMBUSApiService
) {
    fun createCall(orderId: String, targetType: String): Flow<Result<CallSession>> = flow {
        try {
            val response = apiService.createOrderCall(
                orderId,
                CreateCallRequest(targetType = normalizeTargetType(targetType))
            )
            val call = response.body()?.call
            if (response.isSuccessful && response.body()?.success == true && call != null) {
                emit(Result.success(call))
            } else {
                emit(Result.failure(Exception(response.body()?.error ?: "Panggilan belum bisa dimulai.")))
            }
        } catch (error: Exception) {
            emit(Result.failure(error))
        }
    }

    fun createCustomerCall(orderId: String): Flow<Result<CallSession>> = createCall(orderId, "customer")

    fun joinCall(orderId: String, callId: String, callToken: String): Flow<Result<CallSession>> = flow {
        try {
            val response = apiService.joinOrderCall(orderId, callId, JoinCallRequest(callToken = callToken))
            val call = response.body()?.call
            if (response.isSuccessful && response.body()?.success == true && call != null) {
                emit(Result.success(call))
            } else {
                emit(Result.failure(Exception(response.body()?.error ?: "Panggilan tidak tersedia.")))
            }
        } catch (error: Exception) {
            emit(Result.failure(error))
        }
    }

    fun endCall(orderId: String, callId: String, status: String = "ended"): Flow<Result<CallSession>> = flow {
        try {
            val response = apiService.endOrderCall(orderId, callId, EndCallRequest(status = status))
            val call = response.body()?.call
            if (response.isSuccessful && response.body()?.success == true && call != null) {
                emit(Result.success(call))
            } else {
                emit(Result.failure(Exception(response.body()?.error ?: "Panggilan sudah ditutup.")))
            }
        } catch (error: Exception) {
            emit(Result.failure(error))
        }
    }

    suspend fun markRead(orderId: String, lastMessageId: String?) {
        runCatching {
            apiService.markOrderConversationRead(orderId, ReadReceiptRequest(lastMessageId = lastMessageId))
        }
    }

    private fun normalizeTargetType(value: String): String = when (value.trim().lowercase()) {
        "recipient" -> "recipient"
        "courier" -> "courier"
        "support" -> "support"
        else -> "customer"
    }
}
