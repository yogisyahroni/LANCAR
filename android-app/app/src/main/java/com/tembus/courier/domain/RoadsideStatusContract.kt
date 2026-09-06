package com.tembus.courier.domain

import com.tembus.courier.data.model.Order

internal fun isTambalBanOrder(order: Order): Boolean {
    val code = order.serviceCode.orEmpty().trim().lowercase()
    val name = order.serviceName.orEmpty().trim().lowercase()
    return code.startsWith("tambal_ban") || name.contains("tambal ban")
}

internal fun canonicalTambalBanStatus(localStatus: String): String = when (localStatus.trim().lowercase()) {
    "arriving", "navigating" -> "accepted"
    "arrived" -> "pickup_arrived"
    "verifying", "inspecting" -> "picking_up"
    "in_progress", "working" -> "picked_up"
    "service_complete", "completed_service", "report_submitted" -> "delivering"
    "completed", "done", "selesai" -> "delivered"
    else -> localStatus.trim().lowercase()
}
