package com.tembus.customer.ui.screens.tracking

import com.tembus.customer.BuildConfig
import com.tembus.customer.ui.policy.PackageOrderFlowPolicy

// Extracted from TrackingScreen.kt (god-file refactor): pure tracking logic helpers
// + shared enum/data class. All `internal` (same-package), no Compose state — unit-testable.

internal fun eventMatchesStep(eventType: String, step: String): Boolean {
    val normalized = eventType.lowercase()
    return when (step) {
        "merchant_order" -> normalized in setOf("pending_merchant", "merchant_accepted", "order_accepted")
        "merchant_prep" -> normalized in setOf("preparing", "food_preparing", "food_ready")
        "accepted" -> normalized in setOf("accepted", "assigned", "courier_assigned")
        "pickup" -> normalized in setOf("pickup_verified", "picked_up")
        "menuju_pickup" -> normalized in setOf("accepted", "assigned", "courier_assigned", "picking_up")
        "inspeksi" -> normalized in setOf("arrived_pickup", "pickup_verified", "service_started")
        "loading" -> normalized in setOf("loading", "service_started")
        "perjalanan" -> normalized in setOf("in_transit", "delivery_started", "picked_up")
        "unloading" -> normalized in setOf("arrived_dropoff", "unloading")
        "delivery" -> normalized in setOf("delivery_started", "in_transit", "picked_up", "delivering")
        "pod" -> normalized in setOf("pod_verified", "delivered")
        "cancelled" -> normalized in setOf("pickup_cancelled_by_courier", "cancelled", "failed")
        else -> false
    }
}

internal fun formatTrackingDate(value: String): String {
    return value.replace("T", " ").take(16)
}

internal fun absoluteUploadUrl(path: String?): String {
    if (path.isNullOrBlank()) return ""
    if (path.startsWith("http://") || path.startsWith("https://")) return path
    val gatewayBase = BuildConfig.BASE_URL.substringBefore("/api/v1").trimEnd('/')
    return "$gatewayBase$path"
}

internal enum class TrackingServiceKind {
    FOOD,
    TAMBAL_BAN,
    TOWING,
    PACKAGE
}

internal data class TrackingCopy(
    val kind: TrackingServiceKind,
    val timelineTitle: String,
    val acceptedLabel: String,
    val pickupLabel: String,
    val activeLabel: String,
    val completedLabel: String,
    val cancelledLabel: String,
    val proofSectionTitle: String,
    val pickupProofTitle: String,
    val podProofTitle: String
)

internal fun trackingCopy(
    serviceSubType: String?,
    model: String?,
    merchantId: String?,
    serviceCategory: String? = null,
): TrackingCopy {
    // Tracking payloads from older orders may omit `service_sub_type` while
    // still carrying the canonical `service_category`. Include both fields so
    // a roadside order can never fall through to parcel vocabulary merely
    // because its subtype is missing or provider-specific.
    val normalized = listOfNotNull(serviceCategory, serviceSubType, model)
        .joinToString(" ")
        .lowercase()
    return when {
        normalized.contains("towing") || normalized.contains("derek") -> TrackingCopy(
            kind = TrackingServiceKind.TOWING,
            timelineTitle = "Timeline towing",
            acceptedLabel = "Driver towing menerima order",
            pickupLabel = "Kendaraan diverifikasi di titik jemput",
            activeLabel = "Kendaraan dalam proses towing",
            completedLabel = "Towing selesai",
            cancelledLabel = "Towing tidak dilanjutkan",
            proofSectionTitle = "Bukti towing",
            pickupProofTitle = "Foto kendaraan saat pickup",
            podProofTitle = "Foto serah terima akhir"
        )
        normalized.contains("tambal") || normalized.contains("ban") || normalized.contains("tire") -> TrackingCopy(
            kind = TrackingServiceKind.TAMBAL_BAN,
            timelineTitle = "Timeline layanan",
            acceptedLabel = "Teknisi menerima order",
            pickupLabel = "Teknisi tiba dan verifikasi lokasi",
            activeLabel = "Perbaikan ban sedang dikerjakan",
            completedLabel = "Layanan selesai",
            cancelledLabel = "Layanan tidak dilanjutkan",
            proofSectionTitle = "Bukti layanan tambal ban",
            pickupProofTitle = "Foto kondisi sebelum layanan",
            podProofTitle = "Foto penyelesaian layanan"
        )
        !merchantId.isNullOrBlank() || normalized.contains("food") -> TrackingCopy(
            kind = TrackingServiceKind.FOOD,
            timelineTitle = "Timeline pengiriman",
            acceptedLabel = "Kurir sepeda mengambil",
            pickupLabel = "Diverifikasi di merchant",
            activeLabel = "Dalam pengantaran",
            completedLabel = "POD diterima",
            cancelledLabel = "Pengiriman tidak dilanjutkan",
            proofSectionTitle = "Bukti pengiriman",
            pickupProofTitle = "Foto pickup di merchant",
            podProofTitle = "Foto POD"
        )
        else -> TrackingCopy(
            kind = TrackingServiceKind.PACKAGE,
            timelineTitle = "Timeline pengiriman",
            acceptedLabel = "Kurir menerima order",
            pickupLabel = "Barang diverifikasi di pickup",
            activeLabel = "Dalam pengantaran",
            completedLabel = "POD diterima",
            cancelledLabel = "Pengiriman tidak dilanjutkan",
            proofSectionTitle = "Bukti pengiriman",
            pickupProofTitle = "Foto barang pickup",
            podProofTitle = "Foto POD"
        )
    }
}

internal fun trackingStageText(
    status: String?,
    serviceSubType: String?,
    serviceCategory: String? = null,
    model: String? = null,
): String {
    val copy = trackingCopy(serviceSubType, model, null, serviceCategory)
    return when (status?.lowercase()) {
        "scheduled" -> if (copy.kind == TrackingServiceKind.FOOD) "Pesanan terjadwal, akan diproses merchant mendekati jam pilihan" else "Order terjadwal"
        "pending_merchant" -> "Menunggu merchant menerima pesanan"
        "preparing" -> "Merchant sedang menyiapkan makanan"
        "searching" -> if (copy.kind == TrackingServiceKind.FOOD) "Mencari kurir sepeda terdekat" else "Mencari driver terdekat"
        "accepted", "picking_up", "assigned" -> when (copy.kind) {
            TrackingServiceKind.TAMBAL_BAN -> "Teknisi menuju lokasi"
            TrackingServiceKind.TOWING -> "Driver towing menuju titik jemput"
            else -> "Kurir menuju titik pickup"
        }
        "arrived_pickup" -> when (copy.kind) {
            TrackingServiceKind.TAMBAL_BAN -> "Teknisi sudah tiba di lokasi"
            TrackingServiceKind.TOWING -> "Driver towing tiba di titik jemput"
            else -> "Kurir tiba di titik pickup"
        }
        "service_started" -> copy.activeLabel
        "picked_up", "in_transit", "delivering", "loading", "unloading" -> when (copy.kind) {
            TrackingServiceKind.TAMBAL_BAN -> "Layanan sedang dikerjakan"
            TrackingServiceKind.TOWING -> "Kendaraan dalam proses towing"
            else -> "Barang sudah dipickup dan sedang diantar"
        }
        "delivered", "completed" -> copy.completedLabel
        "cancelled", "failed" -> copy.cancelledLabel
        else -> "Menunggu update pengiriman"
    }
}

internal fun isPackageCourierSearchInProgress(
    status: String?,
    kind: TrackingServiceKind,
    hasAssignedCourier: Boolean,
): Boolean {
    return kind == TrackingServiceKind.PACKAGE &&
        PackageOrderFlowPolicy.courierOutcome(status.orEmpty(), hasAssignedCourier) ==
        PackageOrderFlowPolicy.CourierOutcome.SEARCHING
}

internal fun trackingFreshnessLabel(lastLiveTrackingAt: Long?): String {
    if (lastLiveTrackingAt == null) return "Data tracking belum pernah tersinkron"
    val elapsedSeconds = ((System.currentTimeMillis() - lastLiveTrackingAt) / 1000).coerceAtLeast(0)
    return when {
        elapsedSeconds < 60 -> "Posisi terakhir ${elapsedSeconds} detik lalu"
        elapsedSeconds < 3600 -> "Posisi terakhir ${elapsedSeconds / 60} menit lalu"
        else -> "Posisi terakhir lebih dari 1 jam lalu"
    }
}
