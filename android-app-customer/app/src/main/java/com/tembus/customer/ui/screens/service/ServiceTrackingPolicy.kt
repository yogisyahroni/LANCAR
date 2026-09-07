package com.tembus.customer.ui.screens.service

/**
 * Customer-facing Tambal Ban timeline policy.
 *
 * The backend may use several operational statuses for one customer stage.
 * Keep the mapping deterministic and bounded to the five emergency stages
 * shown by the customer UI.
 */
internal fun tambalBanStepIndex(status: String): Int {
    return when (status.trim().lowercase()) {
        "navigating", "picking_up", "assigned", "accepted" -> 0
        "arrived_pickup", "arrived", "onsite" -> 1
        "verifying", "inspecting", "inspection" -> 2
        "loading", "in_progress", "repairing", "working" -> 3
        "completed", "delivered", "finished" -> 4
        else -> 0
    }
}

internal fun tambalBanStatusText(status: String): String {
    return when (tambalBanStepIndex(status)) {
        1 -> "Teknisi sudah tiba"
        2 -> "Teknisi sedang inspeksi"
        3 -> "Teknisi sedang pengerjaan"
        4 -> "Layanan selesai"
        else -> "Teknisi menuju Anda"
    }
}
