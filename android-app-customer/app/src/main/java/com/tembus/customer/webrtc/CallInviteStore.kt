package com.tembus.customer.webrtc

import com.tembus.customer.data.model.CallSignalEvent
import java.util.concurrent.ConcurrentHashMap
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class CallInviteStore @Inject constructor() {
    private val pendingInvites = ConcurrentHashMap<String, CallSignalEvent>()

    fun put(invite: CallSignalEvent) {
        if (invite.callId.isNotBlank() && !invite.callToken.isNullOrBlank()) {
            pendingInvites[invite.callId] = invite
        }
    }

    fun get(callId: String?): CallSignalEvent? {
        if (callId.isNullOrBlank()) return null
        return pendingInvites[callId]
    }

    fun consume(callId: String?): CallSignalEvent? {
        if (callId.isNullOrBlank()) return null
        return pendingInvites.remove(callId)
    }

    fun remove(callId: String?) {
        if (!callId.isNullOrBlank()) {
            pendingInvites.remove(callId)
        }
    }
}
