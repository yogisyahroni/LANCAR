package com.tembus.courier.ui.screens.call

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.courier.data.model.CallSignalEvent
import com.tembus.courier.util.SocketManager
import com.tembus.courier.webrtc.CallInviteStore
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class CallEventsViewModel @Inject constructor(
    private val socketManager: SocketManager,
    private val callInviteStore: CallInviteStore
) : ViewModel() {
    private val _incomingCallInvites = MutableSharedFlow<CallSignalEvent>(extraBufferCapacity = 1)
    val incomingCallInvites = _incomingCallInvites.asSharedFlow()

    init {
        socketManager.connect()
        observeIncomingCalls()
    }

    private fun observeIncomingCalls() {
        viewModelScope.launch {
            socketManager.callSignals.collect { signal ->
                if (signal.event != "call:incoming" || signal.callToken.isNullOrBlank()) return@collect
                callInviteStore.put(signal)
                _incomingCallInvites.emit(signal)
            }
        }
    }
}
