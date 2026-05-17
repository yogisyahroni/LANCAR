package com.lancar.courier.util

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow

object OrderSyncSignalBus {
    const val REASON_PUSH_ORDER = "push_order"
    const val REASON_MANUAL = "manual"
    const val REASON_FOREGROUND = "foreground"

    private val _events = MutableSharedFlow<String>(extraBufferCapacity = 16)
    val events: SharedFlow<String> = _events.asSharedFlow()

    fun signal(reason: String) {
        _events.tryEmit(reason)
    }
}
