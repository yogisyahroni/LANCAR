package com.tembus.merchant.ui.screens.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.merchant.data.model.ChatMessage
import com.tembus.merchant.data.model.ConversationInfo
import com.tembus.merchant.data.repository.ChatRepository
import com.tembus.merchant.data.session.AuthSessionManager
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID

data class ChatUiState(
    val isLoading: Boolean = false,
    val isSending: Boolean = false,
    val messages: List<ChatMessage> = emptyList(),
    val error: String? = null,
    val conversation: ConversationInfo? = null,
    val currentUserId: String = "",
    val failedDraft: String? = null
)

/**
 * ChatViewModel (FB-119) — chat customer↔merchant per order.
 * Merchant app tidak punya SocketManager, jadi pakai polling 5 detik
 * + optimistic local message saat kirim (ditarik ulang dari server
 * ketika polling berikutnya).
 */
class ChatViewModel(
    private val chatRepository: ChatRepository,
    sessionManager: AuthSessionManager,
    val orderId: String
) : ViewModel() {

    private val _uiState = MutableStateFlow(ChatUiState())
    val uiState: StateFlow<ChatUiState> = _uiState.asStateFlow()

    private var pollJob: Job? = null

    init {
        // StateFlow punya .value sync — aman dibaca di init.
        _uiState.update { it.copy(currentUserId = sessionManager.getUserIdSync() ?: "") }
        fetchChatHistory()
        startPolling()
    }

    private fun fetchChatHistory() {
        _uiState.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            chatRepository.getOrderChats(orderId).collectLatest { result ->
                result.onSuccess { history ->
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            messages = history.messages.distinctBy { msg -> msg.id ?: msg.createdAt },
                            conversation = history.conversation
                        )
                    }
                    markLastMessageRead(history.messages)
                }.onFailure { exception ->
                    _uiState.update { it.copy(isLoading = false, error = exception.message) }
                }
            }
        }
    }

    /** Polling ringan — ambil pesan baru dari server tiap 5 detik. */
    private fun startPolling() {
        pollJob = viewModelScope.launch {
            while (isActive) {
                delay(POLL_INTERVAL_MS)
                runCatching {
                    chatRepository.getOrderChats(orderId).collectLatest { result ->
                        result.onSuccess { history ->
                            _uiState.update {
                                it.copy(
                                    messages = history.messages.distinctBy { msg -> msg.id ?: msg.createdAt },
                                    conversation = history.conversation
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    fun sendMessage(messageText: String) {
        val cleaned = messageText.trim()
        if (cleaned.isBlank()) return
        if (cleaned.length > MAX_MESSAGE_LENGTH) {
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
            senderRole = _uiState.value.conversation?.memberType ?: "merchant",
            message = cleaned,
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
            chatRepository.sendOrderChat(orderId, cleaned, clientMessageId).collectLatest { result ->
                result.onSuccess { sentMessage ->
                    _uiState.update { state ->
                        state.copy(
                            isSending = false,
                            messages = state.messages.filterNot { it.id == localMessageId } + sentMessage
                        )
                    }
                }.onFailure { exception ->
                    _uiState.update { state ->
                        state.copy(
                            isSending = false,
                            messages = state.messages.filterNot { it.id == localMessageId },
                            failedDraft = cleaned,
                            error = "Pesan belum terkirim: ${exception.message ?: "coba lagi"}"
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

    fun clearError() {
        _uiState.update { it.copy(error = null) }
    }

    private fun markLastMessageRead(messages: List<ChatMessage>) {
        val lastId = messages.lastOrNull { !it.id.isNullOrBlank() }?.id
        viewModelScope.launch {
            chatRepository.markOrderChatRead(orderId, lastId)
        }
    }

    private fun utcNow(): String {
        val formatter = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }
        return formatter.format(Date())
    }

    override fun onCleared() {
        pollJob?.cancel()
        super.onCleared()
    }

    companion object {
        private const val MAX_MESSAGE_LENGTH = 1000
        private const val POLL_INTERVAL_MS = 5_000L
    }
}
