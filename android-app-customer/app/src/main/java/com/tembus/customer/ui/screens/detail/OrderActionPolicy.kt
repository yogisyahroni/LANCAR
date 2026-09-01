package com.tembus.customer.ui.screens.detail

/**
 * Customer actions are derived from the server state and service subtype.
 * Unknown states intentionally expose no destructive/action shortcut.
 */
object OrderActionPolicy {
    private val trackableStates = setOf("assigned", "accepted", "picking_up", "picked_up", "in_transit", "delivering")
    private val cancellableStates = setOf(
        "searching", "assigned", "accepted", "pending_assignment", "pending", "pending_payment",
        "no_courier_found", "pending_merchant", "preparing", "ready_for_pickup", "picking_up", "scheduled"
    )

    private fun normalize(status: String): String = status.trim().lowercase()

    fun canTrack(status: String): Boolean = normalize(status) in trackableStates

    fun canChat(status: String): Boolean = normalize(status) in trackableStates

    fun canCancel(status: String, serviceSubType: String? = null): Boolean {
        val normalized = normalize(status)
        if (normalized !in cancellableStates) return false
        // The server remains authoritative; this distinction only prevents
        // showing a roadside-specific action for a terminal/unknown state.
        return serviceSubType.orEmpty().isNotBlank() || normalized in setOf("pending", "pending_payment", "scheduled")
    }

    fun statusLabel(status: String): String = when (normalize(status)) {
        "scheduled" -> "Terjadwal"
        "pending_merchant" -> "Menunggu Merchant"
        "preparing" -> "Disiapkan"
        "searching" -> "Mencari Kurir"
        "accepted" -> "Kurir Menuju Pickup"
        "picked_up", "delivering" -> "Sedang Diantar"
        "delivered", "completed" -> "Selesai"
        "cancelled", "canceled" -> "Dibatalkan"
        "failed", "payment_failed" -> "Tidak berhasil"
        else -> "Status sedang diperbarui"
    }
}
