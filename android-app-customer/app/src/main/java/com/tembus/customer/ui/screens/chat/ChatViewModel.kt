package com.tembus.customer.ui.screens.chat

import android.util.Log
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.customer.data.model.ChatMessage
import com.tembus.customer.data.model.ConversationInfo
import com.tembus.customer.data.model.Order
import com.tembus.customer.data.repository.ChatRepository
import com.tembus.customer.data.repository.OrderRepository
import com.tembus.customer.data.session.AuthSessionManager
import com.tembus.customer.util.SocketManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID
import javax.inject.Inject

data class ChatUiState(
    val isLoading: Boolean = false,
    val isSending: Boolean = false,
    val messages: List<ChatMessage> = emptyList(),
    val error: String? = null,
    val orderId: String = "",
    val currentUserId: String = "",
    val conversation: ConversationInfo? = null,
    val failedDraft: String? = null,
    val order: Order? = null
)

@HiltViewModel
class ChatViewModel @Inject constructor(
    private val chatRepository: ChatRepository,
    private val orderRepository: OrderRepository,
    private val socketManager: SocketManager,
    private val sessionManager: AuthSessionManager,
    savedStateHandle: SavedStateHandle
) : ViewModel() {

    private val _uiState = MutableStateFlow(ChatUiState())
    val uiState: StateFlow<ChatUiState> = _uiState.asStateFlow()

    // Read navigation argument "orderId"
    val orderId: String = checkNotNull(savedStateHandle["orderId"]) {
        "Missing mandatory 'orderId' argument for ChatScreen"
    }

    init {
        val userId = sessionManager.getUserIdSync() ?: ""
        _uiState.update { it.copy(orderId = orderId, currentUserId = userId) }

        // 1. Load message history from database/API
        fetchChatHistory()

        // 1b. Load order summary for food context banner & detail button.
        fetchOrderSummary()

        // 2. Establish active Socket.IO connection
        socketManager.connect()
        socketManager.joinOrderRoom(orderId)

        // 3. Begin listening to incoming real-time events
        observeSocketMessages()
    }

    private fun fetchChatHistory() {
        _uiState.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            chatRepository.getOrderChats(orderId).collectLatest { result ->
                result.onSuccess { history ->
                    val loadedMessages = history.messages
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            messages = loadedMessages.distinctBy { msg -> msg.id ?: msg.createdAt },
                            conversation = history.conversation
                        )
                    }
                    markLastMessageRead(loadedMessages)
                }.onFailure { exception ->
                    _uiState.update { it.copy(isLoading = false, error = exception.message) }
                }
            }
        }
    }

    private fun fetchOrderSummary() {
        viewModelScope.launch {
            orderRepository.getOrderDetail(orderId).collectLatest { result ->
                result.onSuccess { order ->
                    _uiState.update { it.copy(order = order) }
                }.onFailure { exception ->
                    Log.w("ChatViewModel", "Order summary unavailable: ${exception.message}")
                }
            }
        }
    }

    private fun observeSocketMessages() {
        viewModelScope.launch {
            socketManager.incomingMessages.collect { newMessage ->
                if (newMessage.orderId != null && newMessage.orderId != orderId) {
                    return@collect
                }
                // Only append message if it is not already present and is for the current session
                _uiState.update { currentState ->
                    val isDuplicate = currentState.messages.any { it.id == newMessage.id && it.id != null }
                    if (isDuplicate) {
                        currentState
                    } else {
                        val updatedMessages = currentState.messages + newMessage
                        markLastMessageRead(updatedMessages)
                        currentState.copy(messages = updatedMessages)
                    }
                }
            }
        }
    }

    fun sendMessage(messageText: String) {
        val cleanedMessage = messageText.trim()
        if (cleanedMessage.isBlank()) return
        if (cleanedMessage.length > MAX_MESSAGE_LENGTH) {
            _uiState.update { it.copy(error = "Pesan maksimal $MAX_MESSAGE_LENGTH karakter.") }
            return
        }

        val clientMessageId = UUID.randomUUID().toString()
        val localMessageId = "local-$clientMessageId"
        val localMessage = ChatMessage(
            id = localMessageId,
            orderId = orderId,
            senderId = _uiState.value.currentUserId,
            senderName = "Anda",
            senderRole = _uiState.value.conversation?.memberType ?: "customer",
            message = cleanedMessage,
            createdAt = utcNow()
        )

        _uiState.update { state ->
            state.copy(
                isSending = true,
                failedDraft = null,
                error = null,
                messages = state.messages + localMessage
            )
        }

        viewModelScope.launch {
            chatRepository.sendOrderChat(orderId, cleanedMessage, clientMessageId).collectLatest { result ->
                result.onSuccess { sentMessage ->
                    _uiState.update { state ->
                        val withoutLocal = state.messages.filterNot { it.id == localMessageId }
                        val hasSentMessage = withoutLocal.any { it.id == sentMessage.id && sentMessage.id != null }
                        state.copy(
                            isSending = false,
                            messages = if (hasSentMessage) withoutLocal else withoutLocal + sentMessage
                        )
                    }
                }
                result.onFailure { exception ->
                    Log.e("ChatViewModel", "Failed to dispatch chat via REST: ${exception.javaClass.simpleName}")
                    _uiState.update { state ->
                        state.copy(
                            isSending = false,
                            messages = state.messages.filterNot { it.id == localMessageId },
                            failedDraft = cleanedMessage,
                            error = "Pesan belum terkirim. Coba lagi saat koneksi stabil."
                        )
                    }
                }
            }
        }
    }

    fun retryFailedDraft() {
        val draft = _uiState.value.failedDraft ?: return
        _uiState.update { it.copy(failedDraft = null) }
        sendMessage(draft)
    }

    fun dismissFailedDraft() {
        _uiState.update { it.copy(failedDraft = null) }
    }

    fun clearError() {
        _uiState.update { it.copy(error = null) }
    }

    override fun onCleared() {
        super.onCleared()
        socketManager.leaveOrderRoom(orderId)
        // Keep socket connected in background or disconnect based on app policy.
        // For granular memory handling, disconnect socket when leaving the active screen.
        socketManager.disconnect()
    }

    private fun utcNow(): String {
        val formatter = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }
        return formatter.format(Date())
    }

    private fun markLastMessageRead(messages: List<ChatMessage>) {
        val lastMessageId = messages.lastOrNull { !it.id.isNullOrBlank() }?.id
        viewModelScope.launch {
            chatRepository.markOrderChatRead(orderId, lastMessageId)
        }
    }

    companion object {
        private const val MAX_MESSAGE_LENGTH = 1000
    }
}
