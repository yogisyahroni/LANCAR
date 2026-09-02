package com.tembus.customer.util

import android.util.Log
import com.tembus.customer.BuildConfig
import com.tembus.customer.data.model.CallSignalEvent
import com.tembus.customer.data.model.ChatMessage
import com.tembus.customer.data.model.NotificationRealtimeEvent
import com.tembus.customer.data.session.AuthSessionManager
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

    private val _callSignals = MutableSharedFlow<CallSignalEvent>(replay = 0)
    val callSignals: SharedFlow<CallSignalEvent> = _callSignals.asSharedFlow()

    private val _notificationEvents = MutableSharedFlow<NotificationRealtimeEvent>(replay = 0)
    val notificationEvents: SharedFlow<NotificationRealtimeEvent> = _notificationEvents.asSharedFlow()

    companion object {
        private const val TAG = "SocketManager"
        private const val EVENT_NEW_MESSAGE = "new_chat_message"
        private const val EVENT_NEW_NOTIFICATION = "new_notification"
        private const val EVENT_ORDER_TRACKING_UPDATED = "order_tracking_updated"
        private val CALL_EVENTS = listOf(
            "call:incoming",
            "call:offer",
            "call:answer",
            "call:ice_candidate",
            "call:ringing",
            "call:accepted",
            "call:rejected",
            "call:missed",
            "call:ended",
            "call:failed"
        )
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
            Log.d(TAG, "Initializing Socket.IO connection to: $socketUrl")
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
            Log.w(TAG, "Disconnected from Real-time Chat WebSocket server: reason=${args.getOrNull(0)?.javaClass?.simpleName ?: "unknown"}")
        }

        socket.on(Socket.EVENT_CONNECT_ERROR) { args ->
            Log.e(TAG, "WebSocket connection error: type=${args.getOrNull(0)?.javaClass?.simpleName ?: "unknown"}")
        }

        socket.on(EVENT_NEW_MESSAGE) { args ->
            val data = args.getOrNull(0) as? JSONObject ?: return@on
            
            try {
                val jsonStr = data.toString()
                val message = json.decodeFromString<ChatMessage>(jsonStr)
                Log.d(TAG, "Received chat event for order=${message.orderId ?: "unknown"} senderRole=${message.senderRole ?: "unknown"}")
                
                scope.launch {
                    _incomingMessages.emit(message)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to parse incoming websocket ChatMessage", e)
            }
        }

        socket.on(EVENT_NEW_NOTIFICATION) { args ->
            val data = args.getOrNull(0) as? JSONObject ?: return@on
            val notification = data.toNotificationRealtimeEvent() ?: return@on
            Log.d(
                TAG,
                "Received notification event category=${notification.category} priority=${notification.priority} order=${notification.orderId ?: "none"}"
            )
            scope.launch { _notificationEvents.emit(notification) }
        }

        socket.on(EVENT_ORDER_TRACKING_UPDATED) { args ->
            val data = args.getOrNull(0) as? JSONObject ?: return@on
            val orderId = data.optString("order_id", data.optString("orderId", ""))
            if (orderId.isNotBlank()) {
                scope.launch { _orderUpdates.emit(orderId) }
            }
        }

        CALL_EVENTS.forEach { eventName ->
            socket.on(eventName) { args ->
                val data = args.getOrNull(0) as? JSONObject ?: return@on
                val signal = data.toCallSignalEvent(eventName) ?: return@on
                Log.d(TAG, "Received call event=$eventName order=${signal.orderId} call=${signal.callId}")
                scope.launch { _callSignals.emit(signal) }
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

    fun joinCallRoom(orderId: String, callId: String) {
        if (orderId.isBlank() || callId.isBlank()) return
        connect()
        mSocket?.emit(
            "join_call_room",
            JSONObject()
                .put("order_id", orderId)
                .put("call_id", callId)
        )
    }

    fun emitCallSignal(event: String, orderId: String, callId: String, payload: JSONObject = JSONObject()) {
        if (orderId.isBlank() || callId.isBlank()) return
        val socketPayload = payload
            .put("order_id", orderId)
            .put("call_id", callId)
        mSocket?.emit(event, socketPayload)
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

private fun JSONObject.cleanString(name: String): String? =
    optString(name).takeIf { it.isNotBlank() && it.lowercase() != "null" }

private fun JSONObject.toCallSignalEvent(eventName: String): CallSignalEvent? {
    val orderId = cleanString("order_id") ?: cleanString("orderId") ?: return null
    val callId = cleanString("call_id") ?: cleanString("callId") ?: return null
    return CallSignalEvent(
        event = eventName,
        orderId = orderId,
        callId = callId,
        senderId = cleanString("sender_id") ?: cleanString("senderId"),
        callerName = cleanString("caller_name") ?: cleanString("callerName"),
        callToken = cleanString("call_token") ?: cleanString("callToken"),
        sdp = cleanString("sdp"),
        sdpMid = cleanString("sdp_mid") ?: cleanString("sdpMid"),
        sdpMLineIndex = optInt("sdp_m_line_index", optInt("sdpMLineIndex", 0)),
        candidate = cleanString("candidate"),
        status = cleanString("status")
    )
}

private fun JSONObject.toNotificationRealtimeEvent(): NotificationRealtimeEvent? {
    val title = cleanString("title")?.take(80) ?: return null
    val body = (cleanString("body") ?: cleanString("message") ?: "").take(180)
    val deepLink = (cleanString("deep_link") ?: cleanString("deepLink"))
        ?.take(160)
        ?.takeIf { it.startsWith("tembus://") }

    return NotificationRealtimeEvent(
        id = cleanString("id") ?: cleanString("notification_id") ?: cleanString("notificationId"),
        title = title,
        body = body,
        type = (cleanString("type") ?: "notification").take(64),
        category = (cleanString("category") ?: "activity").lowercase().take(32),
        priority = (cleanString("priority") ?: "normal").lowercase().take(16),
        orderId = cleanString("order_id") ?: cleanString("orderId"),
        conversationId = cleanString("conversation_id") ?: cleanString("conversationId"),
        promoId = cleanString("promo_id") ?: cleanString("promoId"),
        deepLink = deepLink,
        createdAt = cleanString("created_at") ?: cleanString("createdAt"),
        serviceCode = cleanString("service_code") ?: cleanString("serviceCode"),
        eventVersion = cleanString("event_version") ?: cleanString("eventVersion"),
        target = cleanString("target")
    )
}
