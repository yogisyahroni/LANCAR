package com.tembus.customer.ui.screens.service

/**
 * Customer-facing Tambal Ban timeline policy.
 *
 * The backend may use several operational statuses for one customer stage.
 * Keep the mapping deterministic and bounded to the five emergency stages
 * shown by the customer UI.
 */
internal fun tambalBanStepIndex(status: String): Int {
    return when (status.trim().lowercase().replace('-', '_').replace(' ', '_')) {
        "matching", "pending", "searching", "navigating", "picking_up", "assigned", "accepted", "arriving", "on_the_way" -> 0
        "arrived_pickup", "arrived", "onsite" -> 1
        "verifying", "inspecting", "inspection" -> 2
        "loading", "in_progress", "repairing", "working" -> 3
        "completed", "delivered", "finished" -> 4
        else -> 0
    }
}

internal fun tambalBanStatusText(status: String): String {
    return when (status.trim().lowercase().replace('-', '_').replace(' ', '_')) {
        "matching", "pending", "searching" -> "Sedang mencari teknisi terdekat"
        "arrived_pickup", "arrived", "onsite" -> "Teknisi sudah tiba"
        "verifying", "inspecting", "inspection" -> "Teknisi sedang inspeksi"
        "loading", "in_progress", "repairing", "working" -> "Teknisi sedang pengerjaan"
        "completed", "delivered", "finished" -> "Layanan selesai"
        "cancelled", "canceled" -> "Layanan dibatalkan"
        "failed", "no_courier", "no_courier_found", "expired" -> "Teknisi belum tersedia. Kamu bisa coba lagi."
        else -> "Teknisi menuju Anda"
    }
}

/**
 * Customer-facing towing stages collapse granular operational events into six
 * readable milestones. The underlying status/event stream remains granular
 * for dispatch, safety and proof-of-service reporting.
 */
internal fun towingStepIndex(status: String): Int {
    return when (normalizeRoadsideStatus(status)) {
        "matching", "pending", "searching", "navigating", "picking_up", "assigned", "accepted", "arriving", "on_the_way" -> 0
        "arrived_pickup", "arrived", "onsite" -> 1
        "verifying", "verification", "inspecting", "inspection" -> 1
        "loading", "loaded" -> 2
        "in_transit", "transit", "delivering" -> 3
        "arrived_dropoff", "unloading", "unloaded" -> 4
        "completed", "delivered", "finished" -> 5
        else -> 0
    }
}

internal fun towingStatusText(status: String): String {
    return when (normalizeRoadsideStatus(status)) {
        "matching", "pending", "searching" -> "Sedang mencari petugas towing terdekat"
        "navigating", "picking_up", "assigned", "accepted", "arriving", "on_the_way" -> "Petugas towing menuju kendaraan Anda"
        "arrived_pickup", "arrived", "onsite" -> "Petugas towing sudah tiba"
        "verifying", "verification" -> "Sedang memverifikasi kendaraan"
        "inspecting", "inspection" -> "Sedang memeriksa kondisi kendaraan"
        "loading", "loaded" -> "Kendaraan sedang dinaikkan"
        "in_transit", "transit", "delivering" -> "Kendaraan sedang dibawa ke tujuan"
        "arrived_dropoff", "unloading", "unloaded" -> "Kendaraan sedang diturunkan"
        "completed", "delivered", "finished" -> "Layanan towing selesai"
        "cancelled", "canceled" -> "Layanan towing dibatalkan"
        "failed", "no_courier", "no_courier_found", "expired" -> "Petugas towing belum tersedia. Kamu bisa coba lagi."
        else -> "Memproses layanan towing..."
    }
}

private fun normalizeRoadsideStatus(status: String): String =
    status.trim().lowercase().replace('-', '_').replace(' ', '_')

internal fun normalizeRoadsideStatusForUi(status: String): String =
    normalizeRoadsideStatus(status)

internal fun isRoadsideTerminalStatus(status: String): Boolean =
    normalizeRoadsideStatus(status) in setOf(
        "completed", "delivered", "finished", "cancelled", "canceled", "failed",
        "no_courier", "no_courier_found", "expired"
    )

internal fun isRoadsideNoSupplyStatus(status: String): Boolean =
    normalizeRoadsideStatus(status) in setOf("no_courier", "no_courier_found", "expired")
