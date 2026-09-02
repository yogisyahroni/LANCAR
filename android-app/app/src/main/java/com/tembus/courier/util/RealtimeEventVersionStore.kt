package com.tembus.courier.util

import javax.inject.Inject
import javax.inject.Singleton
import java.util.concurrent.ConcurrentHashMap

@Singleton
class RealtimeEventVersionStore @Inject constructor() {
    private val latestByOrder = ConcurrentHashMap<String, Long>()

    fun accept(orderId: String?, rawVersion: String?): Boolean {
        if (orderId.isNullOrBlank()) return true
        val version = rawVersion?.toLongOrNull() ?: return true
        var accepted = false
        latestByOrder.compute(orderId) { _, previous ->
            accepted = previous == null || version > previous
            if (accepted) version else previous
        }
        return accepted
    }
}
