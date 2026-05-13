package com.lancar.customer.ui.screens.chat

import android.util.Log
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.lancar.customer.data.model.ChatMessage
import com.lancar.customer.data.repository.ChatRepository
import com.lancar.customer.data.session.AuthSessionManager
import com.lancar.customer.util.SocketManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ChatUiState(
    val isLoading: Boolean = false,
    val messages: List<ChatMessage> = emptyList(),
    val error: String? = null,
    val orderId: String = "",
    val currentUserId: String = ""
)

@HiltViewModel
class ChatViewModel @Inject constructor(
    private val chatRepository: ChatRepository,
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
        
        // 2. Establish active Socket.IO connection
        socketManager.connect()
        
        // 3. Begin listening to incoming real-time events
        observeSocketMessages()
    }

    private fun fetchChatHistory() {
        _uiState.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            chatRepository.getOrderChats(orderId).collectLatest { result ->
                result.onSuccess { loadedMessages ->
                    _uiState.update { 
                        it.copy(
                            isLoading = false, 
                            messages = loadedMessages.distinctBy { msg -> msg.id ?: msg.createdAt }
                        ) 
                    }
                }.onFailure { exception ->
                    _uiState.update { it.copy(isLoading = false, error = exception.message) }
                }
            }
        }
    }

    private fun observeSocketMessages() {
        viewModelScope.launch {
            socketManager.incomingMessages.collect { newMessage ->
                // Only append message if it is not already present and is for the current session
                _uiState.update { currentState ->
                    val isDuplicate = currentState.messages.any { it.id == newMessage.id && it.id != null }
                    if (isDuplicate) {
                        currentState
                    } else {
                        currentState.copy(
                            messages = currentState.messages + newMessage
                        )
                    }
                }
            }
        }
    }

    fun sendMessage(messageText: String) {
        if (messageText.isBlank()) return
        
        viewModelScope.launch {
            chatRepository.sendOrderChat(orderId, messageText).collectLatest { result ->
                result.onFailure { exception ->
                    Log.e("ChatViewModel", "Failed to dispatch chat via REST", exception)
                    _uiState.update { it.copy(error = "Gagal mengirim pesan. Sinyal lemah?") }
                }
                // Note: onSuccess is handled seamlessly because the backend Socket emit 
                // transmits the new message to us as well, auto-updating the UI via flow!
            }
        }
    }

    fun clearError() {
        _uiState.update { it.copy(error = null) }
    }

    override fun onCleared() {
        super.onCleared()
        // Keep socket connected in background or disconnect based on app policy.
        // For granular memory handling, disconnect socket when leaving the active screen.
        socketManager.disconnect()
    }
}
