package com.lancar.courier.util

import android.util.Log
import com.lancar.courier.BuildConfig
import com.lancar.courier.data.model.ChatMessage
import com.lancar.courier.data.session.AuthSessionManager
import io.socket.client.IO
import io.socket.client.Socket
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import org.json.JSONObject
import java.net.URISyntaxException
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class SocketManager @Inject constructor(
    private val sessionManager: AuthSessionManager,
    private val json: Json
) {
    private var mSocket: Socket? = null
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val _incomingMessages = MutableSharedFlow<ChatMessage>(replay = 0)
    val incomingMessages: SharedFlow<ChatMessage> = _incomingMessages.asSharedFlow()

    companion object {
        private const val TAG = "SocketManager"
        private const val EVENT_NEW_MESSAGE = "new_chat_message"
    }

    @Synchronized
    fun connect() {
        if (mSocket?.connected() == true) {
            Log.d(TAG, "Socket is already connected.")
            return
        }

        val courierId = sessionManager.getCourierIdSync()
        if (courierId.isNullOrBlank()) {
            Log.e(TAG, "Cannot connect socket: courierId is null or empty.")
            return
        }

        try {
            // Setup socket with query parameters required by backend initWebSocket
            // Role set specifically to "courier"
            val opts = IO.Options.builder()
                .setQuery("userId=$courierId&role=courier")
                .setReconnection(true)
                .build()

            val socketUrl = BuildConfig.BASE_URL
            Log.d(TAG, "Initializing Socket.IO connection to: $socketUrl (Courier: $courierId)")
            mSocket = IO.socket(socketUrl, opts)

            setupListeners()
            mSocket?.connect()

        } catch (e: URISyntaxException) {
            Log.e(TAG, "URI syntax error while setting up Socket", e)
        } catch (e: Exception) {
            Log.e(TAG, "Unexpected socket initialization failure", e)
        }
    }

    private fun setupListeners() {
        val socket = mSocket ?: return

        socket.on(Socket.EVENT_CONNECT) {
            Log.i(TAG, "Successfully connected to Real-time Chat WebSocket server!")
        }

        socket.on(Socket.EVENT_DISCONNECT) { args ->
            Log.w(TAG, "Disconnected from Real-time Chat WebSocket server: ${args.getOrNull(0)}")
        }

        socket.on(Socket.EVENT_CONNECT_ERROR) { args ->
            Log.e(TAG, "WebSocket Connection Error: ${args.getOrNull(0)}")
        }

        socket.on(EVENT_NEW_MESSAGE) { args ->
            val data = args.getOrNull(0) as? JSONObject ?: return@on
            Log.d(TAG, "Received new chat message payload: $data")
            
            try {
                val jsonStr = data.toString()
                val message = json.decodeFromString<ChatMessage>(jsonStr)
                
                scope.launch {
                    _incomingMessages.emit(message)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to parse incoming websocket ChatMessage", e)
            }
        }
    }

    @Synchronized
    fun disconnect() {
        mSocket?.let {
            Log.d(TAG, "Disconnecting Socket.IO connection actively.")
            it.disconnect()
            it.off()
        }
        mSocket = null
    }
}
