package com.tembus.courier.ui.screens.call

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.courier.data.model.CallSession
import com.tembus.courier.data.repository.CallRepository
import com.tembus.courier.util.SocketManager
import com.tembus.courier.webrtc.CallInviteStore
import com.tembus.courier.webrtc.RtcAudioClient
import com.tembus.courier.webrtc.RtcConnectionState
import com.tembus.courier.webrtc.RtcLocalSignal
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import org.json.JSONObject
import javax.inject.Inject

enum class InAppCallState {
    OUTGOING,
    INCOMING,
    ACCEPTED,
    ENDED,
    MISSED,
    FAILED
}

data class InAppCallUiState(
    val callState: InAppCallState = InAppCallState.OUTGOING,
    val targetName: String = "Pelanggan",
    val micMuted: Boolean = false,
    val isStarting: Boolean = false,
    val errorMessage: String? = null,
    val callId: String? = null
)

@HiltViewModel
class InAppCallViewModel @Inject constructor(
    private val callRepository: CallRepository,
    private val socketManager: SocketManager,
    private val rtcAudioClient: RtcAudioClient,
    private val callInviteStore: CallInviteStore
) : ViewModel() {
    private val _uiState = MutableStateFlow(InAppCallUiState())
    val uiState: StateFlow<InAppCallUiState> = _uiState.asStateFlow()

    private var orderId: String? = null
    private var activeCallId: String? = null
    private var activeCallToken: String? = null
    private var activeTargetType: String = "customer"
    private var remoteOfferSdp: String? = null
    private var startJob: Job? = null

    init {
        observeCallSignals()
    }

    fun start(
        orderId: String,
        targetName: String?,
        targetType: String,
        initialState: InAppCallState,
        routeCallId: String?
    ) {
        if (this.orderId == orderId && _uiState.value.callState !in terminalStates) return
        this.orderId = orderId
        activeTargetType = normalizeTargetType(targetType)
        _uiState.value = InAppCallUiState(
            callState = initialState,
            targetName = targetName?.takeIf { it.isNotBlank() } ?: targetLabel(activeTargetType),
            callId = routeCallId,
            isStarting = true
        )
        socketManager.connect()
        socketManager.joinOrderRoom(orderId)
        startJob?.cancel()
        startJob = viewModelScope.launch {
            if (initialState == InAppCallState.INCOMING) {
                prepareIncomingCall(orderId, routeCallId)
            } else {
                prepareOutgoingCall(orderId, activeTargetType)
            }
        }
    }

    fun acceptIncomingCall() {
        val currentOrderId = orderId ?: return
        val callId = activeCallId ?: _uiState.value.callId
        val token = activeCallToken ?: callInviteStore.get(callId)?.callToken
        if (callId.isNullOrBlank() || token.isNullOrBlank()) {
            fail("Panggilan masuk tidak valid.")
            return
        }
        viewModelScope.launch {
            callRepository.joinCall(currentOrderId, callId, token).collectLatest { result ->
                result.onSuccess { call ->
                    activeCallToken = token
                    prepareRtc(call, createOffer = false)
                    remoteOfferSdp?.let { rtcAudioClient.handleOffer(it) }
                    socketManager.emitCallSignal("call:accepted", currentOrderId, call.id)
                    _uiState.update { it.copy(callState = InAppCallState.ACCEPTED, isStarting = false, callId = call.id) }
                }.onFailure { error ->
                    fail(error.message ?: "Panggilan tidak bisa diterima.")
                }
            }
        }
    }

    fun retry() {
        val currentOrderId = orderId ?: return
        start(currentOrderId, _uiState.value.targetName, activeTargetType, InAppCallState.OUTGOING, null)
    }

    fun toggleMute() {
        val muted = !_uiState.value.micMuted
        rtcAudioClient.setMicrophoneMuted(muted)
        _uiState.update { it.copy(micMuted = muted) }
    }

    fun endCall(status: String = "ended") {
        val currentOrderId = orderId
        val currentCallId = activeCallId ?: _uiState.value.callId
        rtcAudioClient.close()
        if (!currentOrderId.isNullOrBlank() && !currentCallId.isNullOrBlank()) {
            socketManager.emitCallSignal("call:ended", currentOrderId, currentCallId, JSONObject().put("status", status))
            viewModelScope.launch {
                callRepository.endCall(currentOrderId, currentCallId, status).collectLatest { Unit }
            }
        }
        callInviteStore.remove(currentCallId)
        _uiState.update {
            it.copy(
                callState = if (status == "missed" || status == "rejected") InAppCallState.MISSED else InAppCallState.ENDED,
                isStarting = false
            )
        }
    }

    private suspend fun prepareOutgoingCall(orderId: String, targetType: String) {
        callRepository.createCall(orderId, targetType).collectLatest { result ->
            result.onSuccess { call ->
                activeTargetType = normalizeTargetType(call.targetType ?: targetType)
                activeCallId = call.id
                activeCallToken = call.callToken
                socketManager.joinCallRoom(orderId, call.id)
                prepareRtc(call, createOffer = true)
                _uiState.update {
                    it.copy(
                        callState = InAppCallState.OUTGOING,
                        targetName = targetLabel(activeTargetType),
                        isStarting = false,
                        callId = call.id
                    )
                }
            }.onFailure { error ->
                fail(error.message ?: "Panggilan belum tersedia.")
            }
        }
    }

    private suspend fun prepareIncomingCall(orderId: String, routeCallId: String?) {
        val invite = callInviteStore.get(routeCallId)
        if (invite == null || invite.callToken.isNullOrBlank()) {
            fail("Panggilan masuk tidak tersedia.")
            return
        }
        activeCallId = invite.callId
        activeCallToken = invite.callToken
        remoteOfferSdp = invite.sdp
        socketManager.joinCallRoom(orderId, invite.callId)
        _uiState.update {
            it.copy(
                callState = InAppCallState.INCOMING,
                callId = invite.callId,
                targetName = invite.callerName?.takeIf { name -> name.isNotBlank() } ?: it.targetName,
                isStarting = false
            )
        }
    }

    private fun prepareRtc(call: CallSession, createOffer: Boolean) {
        val started = rtcAudioClient.start(
            iceServerConfigs = call.iceServers,
            onLocalSignal = ::sendLocalSignal,
            onConnectionState = ::handleRtcState
        )
        if (!started) {
            fail("Perangkat tidak bisa memulai panggilan.")
            return
        }
        if (createOffer) {
            rtcAudioClient.createOffer()
        }
    }

    private fun observeCallSignals() {
        viewModelScope.launch {
            socketManager.callSignals.collect { signal ->
                val currentOrderId = orderId
                val currentCallId = activeCallId ?: _uiState.value.callId
                if (currentOrderId.isNullOrBlank() || signal.orderId != currentOrderId) return@collect
                if (!currentCallId.isNullOrBlank() && signal.callId != currentCallId) return@collect

                when (signal.event) {
                    "call:incoming" -> {
                        callInviteStore.put(signal)
                        activeCallId = signal.callId
                        activeCallToken = signal.callToken
                        remoteOfferSdp = signal.sdp
                        _uiState.update {
                            it.copy(
                                callState = InAppCallState.INCOMING,
                                callId = signal.callId,
                                targetName = signal.callerName?.takeIf { name -> name.isNotBlank() } ?: it.targetName
                            )
                        }
                    }
                    "call:offer" -> {
                        remoteOfferSdp = signal.sdp
                        if (_uiState.value.callState == InAppCallState.ACCEPTED && !signal.sdp.isNullOrBlank()) {
                            rtcAudioClient.handleOffer(signal.sdp)
                        }
                    }
                    "call:answer" -> signal.sdp?.let { rtcAudioClient.handleAnswer(it) }
                    "call:ice_candidate" -> {
                        val candidate = signal.candidate ?: return@collect
                        rtcAudioClient.addRemoteIceCandidate(signal.sdpMid, signal.sdpMLineIndex, candidate)
                    }
                    "call:accepted" -> _uiState.update { it.copy(callState = InAppCallState.ACCEPTED) }
                    "call:rejected", "call:missed" -> endCall("missed")
                    "call:ended" -> {
                        rtcAudioClient.close()
                        callInviteStore.remove(signal.callId)
                        _uiState.update { it.copy(callState = InAppCallState.ENDED, isStarting = false) }
                    }
                    "call:failed" -> fail("Panggilan terputus.")
                }
            }
        }
    }

    private fun sendLocalSignal(signal: RtcLocalSignal) {
        val currentOrderId = orderId ?: return
        val currentCallId = activeCallId ?: _uiState.value.callId ?: return
        val (eventName, payload) = when (signal) {
            is RtcLocalSignal.Offer -> "call:offer" to JSONObject().put("sdp", signal.sdp)
            is RtcLocalSignal.Answer -> "call:answer" to JSONObject().put("sdp", signal.sdp)
            is RtcLocalSignal.Candidate -> "call:ice_candidate" to JSONObject()
                .put("sdp_mid", signal.sdpMid)
                .put("sdp_m_line_index", signal.sdpMLineIndex)
                .put("candidate", signal.candidate)
        }
        socketManager.emitCallSignal(eventName, currentOrderId, currentCallId, payload)
    }

    private fun handleRtcState(state: RtcConnectionState) {
        when (state) {
            RtcConnectionState.CONNECTED -> _uiState.update { it.copy(callState = InAppCallState.ACCEPTED, isStarting = false) }
            RtcConnectionState.FAILED -> fail("Koneksi panggilan gagal.")
            RtcConnectionState.DISCONNECTED -> _uiState.update { it.copy(errorMessage = "Koneksi panggilan tidak stabil.") }
            else -> Unit
        }
    }

    private fun fail(message: String) {
        rtcAudioClient.close()
        _uiState.update {
            it.copy(callState = InAppCallState.FAILED, isStarting = false, errorMessage = message)
        }
    }

    private fun normalizeTargetType(value: String): String = when (value.trim().lowercase()) {
        "recipient" -> "recipient"
        "courier" -> "courier"
        else -> "customer"
    }

    private fun targetLabel(targetType: String): String = when (normalizeTargetType(targetType)) {
        "recipient" -> "Penerima"
        "courier" -> "Kurir"
        else -> "Pelanggan"
    }

    override fun onCleared() {
        super.onCleared()
        rtcAudioClient.close()
        val currentOrderId = orderId
        val currentCallId = activeCallId ?: _uiState.value.callId
        if (!currentOrderId.isNullOrBlank() && !currentCallId.isNullOrBlank()) {
            socketManager.emitCallSignal("call:ended", currentOrderId, currentCallId)
        }
    }

    companion object {
        private val terminalStates = setOf(
            InAppCallState.ENDED,
            InAppCallState.MISSED,
            InAppCallState.FAILED
        )
    }
}
