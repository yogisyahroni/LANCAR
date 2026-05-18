package com.lancar.courier.ui.screens.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.lancar.courier.data.model.ChatMessage
import com.lancar.courier.data.repository.ChatRepository
import com.lancar.courier.data.session.AuthSessionManager
import com.lancar.courier.util.SocketManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class ChatViewModel @Inject constructor(
    private val chatRepository: ChatRepository,
    private val socketManager: SocketManager,
    private val sessionManager: AuthSessionManager
) : ViewModel() {

    private val _messages = MutableStateFlow<List<ChatMessage>>(emptyList())
    val messages: StateFlow<List<ChatMessage>> = _messages.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _errorMessage = MutableStateFlow<String?>(null)
    val errorMessage: StateFlow<String?> = _errorMessage.asStateFlow()

    private var currentOrderId: String? = null

    // Determine logged-in courier's dynamic senderId safely
    val currentCourierId: StateFlow<String?> = sessionManager.courierId
        .stateIn(viewModelScope, SharingStarted.Lazily, null)

    init {
        observeIncomingMessages()
        // Ensure socket is securely established on view initialization
        socketManager.connect()
    }

    /**
     * Ingest messages from active job conversation stream.
     */
    fun loadChatHistory(orderId: String) {
        currentOrderId?.let { socketManager.leaveOrderRoom(it) }
        currentOrderId = orderId
        socketManager.joinOrderRoom(orderId)
        viewModelScope.launch {
            _isLoading.value = true
            _errorMessage.value = null
            
            chatRepository.getOrderChats(orderId)
                .catch { e ->
                    _errorMessage.value = e.localizedMessage ?: "Terjadi kesalahan jaringan."
                }
                .collect { result ->
                    result.onSuccess { history ->
                        _messages.value = history
                    }.onFailure { e ->
                        _errorMessage.value = e.localizedMessage ?: "Gagal sinkronisasi data."
                    }
                }
            _isLoading.value = false
        }
    }

    /**
     * Injects an outbound message into local repository pipeline and broadcasts updates.
     */
    fun sendMessage(messageText: String) {
        val orderId = currentOrderId ?: return
        if (messageText.isBlank()) return

        viewModelScope.launch {
            chatRepository.sendOrderChat(orderId, messageText)
                .catch { e ->
                    _errorMessage.value = e.localizedMessage ?: "Terjadi kesalahan."
                }
                .collect { result ->
                    result.onSuccess { newMsg ->
                        // Immediate localized render to prevent layout lag
                        _messages.update { current -> current + newMsg }
                    }.onFailure { e ->
                        _errorMessage.value = e.localizedMessage ?: "Pesan gagal terkirim."
                    }
                }
        }
    }

    /**
     * Subscribes to WebSocket message pipeline filtered specifically for active Order ID context.
     */
    private fun observeIncomingMessages() {
        viewModelScope.launch {
            socketManager.incomingMessages
                .filter { it.orderId == currentOrderId } // Match against specific active channel
                .collect { incoming ->
                    val courierId = currentCourierId.value
                    // Prevent duplicate rendering if courier triggered the broadcast via REST completion
                    val isDuplicate = messages.value.any { it.id == incoming.id || (it.messageText == incoming.messageText && it.createdAt == incoming.createdAt) }
                    
                    if (!isDuplicate && incoming.senderId != courierId) {
                        _messages.update { it + incoming }
                    }
                }
        }
    }

    override fun onCleared() {
        super.onCleared()
        currentOrderId?.let { socketManager.leaveOrderRoom(it) }
        // Clean up runtime sockets when exiting Chat scope to save battery bandwidth
        socketManager.disconnect()
    }
}
