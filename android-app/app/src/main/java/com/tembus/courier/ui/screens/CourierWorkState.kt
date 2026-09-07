package com.tembus.courier.ui.screens

/**
 * Client-side presentation/prefight policy for courier work.
 * The server remains authoritative; these helpers only prevent an offer from
 * being accepted while the local snapshot is known to be incomplete.
 */
internal val ACTIVE_COURIER_WORK_STATUSES = setOf(
    "assigned",
    "accepted",
    "picked_up",
    "in_transit",
)

internal fun isCourierSnapshotRecovered(lastRemoteSyncAt: Long?, isSyncing: Boolean): Boolean =
    lastRemoteSyncAt != null && !isSyncing

internal fun canAcceptCourierWork(
    snapshotRecovered: Boolean,
    activeJobCount: Int,
    maxActiveJobs: Int,
): Boolean = snapshotRecovered && activeJobCount < maxActiveJobs.coerceAtLeast(1)

internal fun presenceStateLabel(state: String?): String = when (state?.lowercase()) {
    "online" -> "Online"
    "break" -> "Break"
    "limited" -> "Limited"
    "unavailable" -> "Tidak tersedia"
    else -> "Offline"
}

internal fun presenceStateMessage(state: String?, reason: String? = null): String = when (state?.lowercase()) {
    "online" -> "Siap menerima pekerjaan"
    "break" -> "Break aktif. Tawaran baru dijeda."
    "limited" -> "Mode terbatas. Capability yang tidak sesuai tidak akan ditawarkan."
    "unavailable" -> "Tidak tersedia: ${reason ?: "heartbeat atau lokasi perlu dipulihkan"}."
    else -> "Off duty. Aktifkan duty saat siap bekerja."
}
