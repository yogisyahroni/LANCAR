package com.tembus.customer.ui.screens.tracking

/**
 * Prevents a delayed polling/socket response from moving a visible timeline
 * backwards after a newer authoritative snapshot has already been rendered.
 */
internal fun trackingStageRank(stage: String?): Int {
    return when (stage?.trim()?.lowercase()) {
        "mencari_kurir" -> 0
        "menuju_pickup", "kurir_menuju_pickup" -> 1
        "validasi_pickup", "inspeksi" -> 2
        "loading" -> 3
        "menuju_tujuan", "perjalanan" -> 4
        "unloading" -> 5
        "selesai" -> 6
        // Cancellation is terminal and must not be overwritten by an older
        // in-flight success response.
        "dibatalkan" -> 100
        else -> -1
    }
}

internal fun shouldAcceptTrackingSnapshot(currentStage: String?, incomingStage: String?): Boolean {
    val currentRank = trackingStageRank(currentStage)
    val incomingRank = trackingStageRank(incomingStage)
    if (currentRank < 0 || incomingRank < 0) return true
    return incomingRank >= currentRank
}
