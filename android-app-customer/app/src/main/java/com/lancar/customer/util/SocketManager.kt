package com.lancar.customer.util

import android.util.Log
import com.lancar.customer.BuildConfig
import com.lancar.customer.data.model.ChatMessage
import com.lancar.customer.data.session.AuthSessionManager
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
import okhttp3.OkHttpClient
import org.json.JSONObject
import java.net.URISyntaxException
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class SocketManager @Inject constructor(
    private val sessionManager: AuthSessionManager,
    private val json: Json,
    private val okHttpClient: OkHttpClient
) {
    private var mSocket: Socket? = null
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val _incomingMessages = MutableSharedFlow<ChatMessage>(replay = 0)
    val incomingMessages: SharedFlow<ChatMessage> = _incomingMessages.asSharedFlow()

    private val _orderUpdates = MutableSharedFlow<String>(replay = 0)
    val orderUpdates: SharedFlow<String> = _orderUpdates.asSharedFlow()

    companion object {
        private const val TAG = "SocketManager"
        private const val EVENT_NEW_MESSAGE = "new_chat_message"
        private const val EVENT_ORDER_TRACKING_UPDATED = "order_tracking_updated"
    }

    @Synchronized
    fun connect() {
        if (mSocket?.connected() == true) {
            Log.d(TAG, "Socket is already connected.")
            return
        }

        val userId = sessionManager.getUserIdSync()
        if (userId.isNullOrBlank()) {
            Log.e(TAG, "Cannot connect socket: userId is null or empty.")
            return
        }

        try {
            val token = sessionManager.getTokenSync()
            if (token.isNullOrBlank()) {
                Log.e(TAG, "Cannot connect socket: authToken is null or empty.")
                return
            }

            // Setup socket with query parameters AND auth payload for JWT validation
            val opts = IO.Options.builder()
                .setQuery("userId=$userId&role=customer")
                .setAuth(mapOf("token" to token))
                .setReconnection(true)
                .build()

            // 🛡️ Force secure transport utilizing our pinned OkHttpClient
            opts.callFactory = okHttpClient
            opts.webSocketFactory = okHttpClient

            val socketUrl = socketServerUrl()
            Log.d(TAG, "Initializing Socket.IO connection to: $socketUrl (User: $userId)")
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

        socket.on(EVENT_ORDER_TRACKING_UPDATED) { args ->
            val data = args.getOrNull(0) as? JSONObject ?: return@on
            val orderId = data.optString("order_id", data.optString("orderId", ""))
            if (orderId.isNotBlank()) {
                scope.launch { _orderUpdates.emit(orderId) }
            }
        }
    }

    fun joinOrderRoom(orderId: String) {
        if (orderId.isBlank()) return
        connect()
        mSocket?.emit("join_order_room", JSONObject().put("order_id", orderId))
    }

    fun leaveOrderRoom(orderId: String) {
        if (orderId.isBlank()) return
        mSocket?.emit("leave_order_room", JSONObject().put("order_id", orderId))
    }

    private fun socketServerUrl(): String =
        BuildConfig.BASE_URL
            .substringBefore("/api/v1")
            .trimEnd('/')

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
