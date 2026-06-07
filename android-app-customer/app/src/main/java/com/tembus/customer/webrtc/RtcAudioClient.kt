package com.tembus.customer.webrtc

import android.content.Context
import android.os.Build
import android.util.Log
import com.tembus.customer.data.model.IceServerConfig
import dagger.hilt.android.qualifiers.ApplicationContext
import org.webrtc.AudioSource
import org.webrtc.AudioTrack
import org.webrtc.DataChannel
import org.webrtc.IceCandidate
import org.webrtc.MediaConstraints
import org.webrtc.MediaStream
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.RtpReceiver
import org.webrtc.RtpTransceiver
import org.webrtc.SdpObserver
import org.webrtc.SessionDescription
import org.webrtc.audio.JavaAudioDeviceModule
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean
import javax.inject.Inject
import javax.inject.Singleton

sealed class RtcLocalSignal {
    data class Offer(val sdp: String) : RtcLocalSignal()
    data class Answer(val sdp: String) : RtcLocalSignal()
    data class Candidate(
        val sdpMid: String?,
        val sdpMLineIndex: Int,
        val candidate: String
    ) : RtcLocalSignal()
}

enum class RtcConnectionState {
    IDLE,
    CONNECTING,
    CONNECTED,
    DISCONNECTED,
    FAILED,
    CLOSED
}

@Singleton
class RtcAudioClient @Inject constructor(
    @ApplicationContext private val context: Context
) {
    private var peerConnection: PeerConnection? = null
    private var audioSource: AudioSource? = null
    private var audioTrack: AudioTrack? = null
    private var onLocalSignal: ((RtcLocalSignal) -> Unit)? = null
    private var onConnectionState: ((RtcConnectionState) -> Unit)? = null

    private val factory: PeerConnectionFactory by lazy {
        if (factoryInitialized.compareAndSet(false, true)) {
            PeerConnectionFactory.initialize(
                PeerConnectionFactory.InitializationOptions.builder(context)
                    .createInitializationOptions()
            )
        }

        val audioDeviceModule = JavaAudioDeviceModule.builder(context)
            .setUseHardwareAcousticEchoCanceler(Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q)
            .setUseHardwareNoiseSuppressor(Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q)
            .createAudioDeviceModule()

        PeerConnectionFactory.builder()
            .setAudioDeviceModule(audioDeviceModule)
            .createPeerConnectionFactory()
    }

    @Synchronized
    fun start(
        iceServerConfigs: List<IceServerConfig>,
        onLocalSignal: (RtcLocalSignal) -> Unit,
        onConnectionState: (RtcConnectionState) -> Unit
    ): Boolean {
        close()
        this.onLocalSignal = onLocalSignal
        this.onConnectionState = onConnectionState
        this.onConnectionState?.invoke(RtcConnectionState.CONNECTING)

        val rtcConfiguration = PeerConnection.RTCConfiguration(buildIceServers(iceServerConfigs)).apply {
            sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
        }

        val createdConnection = factory.createPeerConnection(rtcConfiguration, peerObserver())
        if (createdConnection == null) {
            this.onConnectionState?.invoke(RtcConnectionState.FAILED)
            return false
        }

        peerConnection = createdConnection
        val createdAudioSource = factory.createAudioSource(audioConstraints())
        audioSource = createdAudioSource
        val createdAudioTrack = factory.createAudioTrack("tembus-audio-${UUID.randomUUID()}", createdAudioSource).apply {
            setEnabled(true)
        }
        audioTrack = createdAudioTrack
        createdConnection.addTrack(createdAudioTrack, listOf("tembus-audio"))
        return true
    }

    fun createOffer() {
        val connection = peerConnection ?: return
        connection.createOffer(object : SdpObserver {
            override fun onCreateSuccess(description: SessionDescription) {
                connection.setLocalDescription(object : SdpObserver {
                    override fun onSetSuccess() {
                        onLocalSignal?.invoke(RtcLocalSignal.Offer(description.description))
                    }

                    override fun onSetFailure(error: String?) {
                        reportSdpFailure("set local offer", error)
                    }

                    override fun onCreateSuccess(description: SessionDescription?) = Unit
                    override fun onCreateFailure(error: String?) = Unit
                }, description)
            }

            override fun onCreateFailure(error: String?) {
                reportSdpFailure("create offer", error)
            }

            override fun onSetSuccess() = Unit
            override fun onSetFailure(error: String?) = Unit
        }, offerAnswerConstraints())
    }

    fun handleOffer(sdp: String) {
        val connection = peerConnection ?: return
        val offer = SessionDescription(SessionDescription.Type.OFFER, sdp)
        connection.setRemoteDescription(object : SdpObserver {
            override fun onSetSuccess() {
                createAnswer()
            }

            override fun onSetFailure(error: String?) {
                reportSdpFailure("set remote offer", error)
            }

            override fun onCreateSuccess(description: SessionDescription?) = Unit
            override fun onCreateFailure(error: String?) = Unit
        }, offer)
    }

    fun handleAnswer(sdp: String) {
        val connection = peerConnection ?: return
        val answer = SessionDescription(SessionDescription.Type.ANSWER, sdp)
        connection.setRemoteDescription(object : SdpObserver {
            override fun onSetSuccess() = Unit
            override fun onSetFailure(error: String?) {
                reportSdpFailure("set remote answer", error)
            }

            override fun onCreateSuccess(description: SessionDescription?) = Unit
            override fun onCreateFailure(error: String?) = Unit
        }, answer)
    }

    fun addRemoteIceCandidate(sdpMid: String?, sdpMLineIndex: Int, candidate: String) {
        val connection = peerConnection ?: return
        if (candidate.isBlank()) return
        connection.addIceCandidate(IceCandidate(sdpMid, sdpMLineIndex, candidate))
    }

    fun setMicrophoneMuted(muted: Boolean) {
        audioTrack?.setEnabled(!muted)
    }

    @Synchronized
    fun close() {
        audioTrack?.setEnabled(false)
        audioTrack?.dispose()
        audioSource?.dispose()
        peerConnection?.close()
        peerConnection?.dispose()
        audioTrack = null
        audioSource = null
        peerConnection = null
        onConnectionState?.invoke(RtcConnectionState.CLOSED)
    }

    private fun createAnswer() {
        val connection = peerConnection ?: return
        connection.createAnswer(object : SdpObserver {
            override fun onCreateSuccess(description: SessionDescription) {
                connection.setLocalDescription(object : SdpObserver {
                    override fun onSetSuccess() {
                        onLocalSignal?.invoke(RtcLocalSignal.Answer(description.description))
                    }

                    override fun onSetFailure(error: String?) {
                        reportSdpFailure("set local answer", error)
                    }

                    override fun onCreateSuccess(description: SessionDescription?) = Unit
                    override fun onCreateFailure(error: String?) = Unit
                }, description)
            }

            override fun onCreateFailure(error: String?) {
                reportSdpFailure("create answer", error)
            }

            override fun onSetSuccess() = Unit
            override fun onSetFailure(error: String?) = Unit
        }, offerAnswerConstraints())
    }

    private fun peerObserver(): PeerConnection.Observer = object : PeerConnection.Observer {
        override fun onSignalingChange(state: PeerConnection.SignalingState?) = Unit
        override fun onIceConnectionReceivingChange(receiving: Boolean) = Unit
        override fun onIceGatheringChange(state: PeerConnection.IceGatheringState?) = Unit
        override fun onIceCandidatesRemoved(candidates: Array<out IceCandidate>?) = Unit
        override fun onAddStream(stream: MediaStream?) = Unit
        override fun onRemoveStream(stream: MediaStream?) = Unit
        override fun onDataChannel(channel: DataChannel?) = Unit
        override fun onRenegotiationNeeded() = Unit
        override fun onAddTrack(receiver: RtpReceiver?, streams: Array<out MediaStream>?) = Unit
        override fun onTrack(transceiver: RtpTransceiver?) = Unit

        override fun onIceCandidate(candidate: IceCandidate?) {
            if (candidate == null || candidate.sdp.isBlank()) return
            onLocalSignal?.invoke(
                RtcLocalSignal.Candidate(
                    sdpMid = candidate.sdpMid,
                    sdpMLineIndex = candidate.sdpMLineIndex,
                    candidate = candidate.sdp
                )
            )
        }

        override fun onIceConnectionChange(state: PeerConnection.IceConnectionState?) {
            when (state) {
                PeerConnection.IceConnectionState.CONNECTED,
                PeerConnection.IceConnectionState.COMPLETED -> onConnectionState?.invoke(RtcConnectionState.CONNECTED)
                PeerConnection.IceConnectionState.DISCONNECTED -> onConnectionState?.invoke(RtcConnectionState.DISCONNECTED)
                PeerConnection.IceConnectionState.FAILED -> onConnectionState?.invoke(RtcConnectionState.FAILED)
                PeerConnection.IceConnectionState.CLOSED -> onConnectionState?.invoke(RtcConnectionState.CLOSED)
                else -> Unit
            }
        }

        override fun onConnectionChange(newState: PeerConnection.PeerConnectionState?) {
            when (newState) {
                PeerConnection.PeerConnectionState.CONNECTED -> onConnectionState?.invoke(RtcConnectionState.CONNECTED)
                PeerConnection.PeerConnectionState.DISCONNECTED -> onConnectionState?.invoke(RtcConnectionState.DISCONNECTED)
                PeerConnection.PeerConnectionState.FAILED -> onConnectionState?.invoke(RtcConnectionState.FAILED)
                PeerConnection.PeerConnectionState.CLOSED -> onConnectionState?.invoke(RtcConnectionState.CLOSED)
                PeerConnection.PeerConnectionState.CONNECTING,
                PeerConnection.PeerConnectionState.NEW -> onConnectionState?.invoke(RtcConnectionState.CONNECTING)
                else -> Unit
            }
        }
    }

    private fun buildIceServers(configs: List<IceServerConfig>): List<PeerConnection.IceServer> {
        val servers = configs
            .flatMap { config ->
                config.urls.mapNotNull { url ->
                    if (url.isBlank()) {
                        null
                    } else {
                        PeerConnection.IceServer.builder(url)
                            .setUsername(config.username.orEmpty())
                            .setPassword(config.credential.orEmpty())
                            .createIceServer()
                    }
                }
            }

        return servers.ifEmpty {
            listOf(PeerConnection.IceServer.builder(DEFAULT_STUN_URL).createIceServer())
        }
    }

    private fun audioConstraints(): MediaConstraints = MediaConstraints().apply {
        optional.add(MediaConstraints.KeyValuePair("googEchoCancellation", "true"))
        optional.add(MediaConstraints.KeyValuePair("googAutoGainControl", "true"))
        optional.add(MediaConstraints.KeyValuePair("googNoiseSuppression", "true"))
    }

    private fun offerAnswerConstraints(): MediaConstraints = MediaConstraints().apply {
        mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveAudio", "true"))
    }

    private fun reportSdpFailure(operation: String, error: String?) {
        Log.w(TAG, "WebRTC $operation failed: ${error?.take(120) ?: "unknown"}")
        onConnectionState?.invoke(RtcConnectionState.FAILED)
    }

    companion object {
        private const val TAG = "RtcAudioClient"
        private const val DEFAULT_STUN_URL = "stun:stun.l.google.com:19302"
        private val factoryInitialized = AtomicBoolean(false)
    }
}
