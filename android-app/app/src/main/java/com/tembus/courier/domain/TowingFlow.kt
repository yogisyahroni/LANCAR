package com.tembus.courier.domain

import com.tembus.courier.data.model.Order

// ============================================================
// TOWING FLOW — State Machine
// ============================================================

enum class TowingStage {
    PENDING_OFFER,
    NAVIGATING_TO_PICKUP,
    ARRIVED_AT_PICKUP,
    VERIFY_IDENTITY,
    INSPECT_VEHICLE,
    LOADING,
    IN_TRANSIT,
    ARRIVED_AT_DROPOFF,
    UNLOADING,
    COMPLETED,
    FAILED,
    CANCELLED
}

enum class TowingNextActionType {
    ACCEPT_OFFER,
    NAVIGATE_TO_PICKUP,
    ARRIVED_AT_PICKUP,
    VERIFY_FACE,
    CAPTURE_INSPECTION,
    START_LOADING,
    START_TRANSIT,
    ARRIVED_AT_DROPOFF,
    START_UNLOADING,
    CAPTURE_COMPLETION,
    CONTACT_SUPPORT,
    NONE
}

data class TowingNextAction(
    val type: TowingNextActionType,
    val label: String,
    val helperText: String,
    val targetStatus: String? = null
)

data class TowingFlowState(
    val stage: TowingStage,
    val title: String,
    val instruction: String,
    val progressLabels: List<String>,
    val currentStepIndex: Int,
    val pickupAddress: String,
    val dropoffAddress: String,
    val nextAction: TowingNextAction,
    val secondaryAction: TowingNextAction? = null
)

object TowingFlowResolver {
    private val completedStatuses = setOf("completed", "done", "selesai")
    private val failedStatuses = setOf("failed", "gagal")
    private val cancelledStatuses = setOf("cancelled", "canceled")
    private val offerStatuses = setOf("pending_offer", "offer", "offered")

    fun resolve(
        order: Order,
        faceVerified: Boolean = false,
        inspectionDone: Boolean = false,
        loadingDone: Boolean = false,
        unloadingDone: Boolean = false
    ): TowingFlowState {
        val status = order.status.trim().lowercase()
        val pickupAddress = order.pickupAddress.ifBlank { "Alamat pickup sedang disinkronkan" }
        val dropoffAddress = order.dropAddress.ifBlank { "Alamat tujuan sedang disinkronkan" }

        val stage = when {
            status in completedStatuses -> TowingStage.COMPLETED
            status in failedStatuses -> TowingStage.FAILED
            status in cancelledStatuses -> TowingStage.CANCELLED
            status in offerStatuses -> TowingStage.PENDING_OFFER
            status == "arriving" || status == "navigating_pickup" -> TowingStage.NAVIGATING_TO_PICKUP
            status == "arrived_pickup" && !faceVerified -> TowingStage.ARRIVED_AT_PICKUP
            status == "arrived_pickup" && faceVerified && !inspectionDone -> TowingStage.VERIFY_IDENTITY
            status == "verifying" -> TowingStage.VERIFY_IDENTITY
            status == "inspecting" -> TowingStage.INSPECT_VEHICLE
            status == "loading" -> TowingStage.LOADING
            status == "in_transit" || status == "transit" -> TowingStage.IN_TRANSIT
            status == "arrived_dropoff" -> TowingStage.ARRIVED_AT_DROPOFF
            status == "unloading" -> TowingStage.UNLOADING
            else -> TowingStage.NAVIGATING_TO_PICKUP
        }

        val nextAction = when (stage) {
            TowingStage.PENDING_OFFER -> TowingNextAction(
                type = TowingNextActionType.ACCEPT_OFFER,
                label = "Terima Order",
                helperText = "Terima pesanan towing dari customer"
            )
            TowingStage.NAVIGATING_TO_PICKUP -> TowingNextAction(
                type = TowingNextActionType.NAVIGATE_TO_PICKUP,
                label = "Navigasi ke Pickup",
                helperText = "Menuju lokasi kendaraan customer"
            )
            TowingStage.ARRIVED_AT_PICKUP -> TowingNextAction(
                type = TowingNextActionType.ARRIVED_AT_PICKUP,
                label = "Tiba di Pickup",
                helperText = "Verifikasi wajah terlebih dahulu"
            )
            TowingStage.VERIFY_IDENTITY -> TowingNextAction(
                type = TowingNextActionType.VERIFY_FACE,
                label = "Verifikasi Wajah",
                helperText = "Scan wajah untuk membuktikan identitas"
            )
            TowingStage.INSPECT_VEHICLE -> TowingNextAction(
                type = TowingNextActionType.CAPTURE_INSPECTION,
                label = "Foto Kondisi Kendaraan",
                helperText = "Foto kendaraan sebelum diangkut sebagai bukti"
            )
            TowingStage.LOADING -> TowingNextAction(
                type = TowingNextActionType.START_TRANSIT,
                label = "Mulai Perjalanan",
                helperText = "Kendaraan sudah diangkut, mulai perjalanan ke tujuan"
            )
            TowingStage.IN_TRANSIT -> TowingNextAction(
                type = TowingNextActionType.ARRIVED_AT_DROPOFF,
                label = "Tiba di Tujuan",
                helperText = "Sampai di lokasi tujuan"
            )
            TowingStage.ARRIVED_AT_DROPOFF -> TowingNextAction(
                type = TowingNextActionType.START_UNLOADING,
                label = "Mulai Unloading",
                helperText = "Turunkan kendaraan dari tow truck"
            )
            TowingStage.UNLOADING -> TowingNextAction(
                type = TowingNextActionType.CAPTURE_COMPLETION,
                label = "Foto Hasil & Serah Terima",
                helperText = "Foto kendaraan setelah diangkut, serah terima ke customer"
            )
            TowingStage.COMPLETED -> TowingNextAction(
                type = TowingNextActionType.NONE,
                label = "Selesai",
                helperText = "Layanan towing telah selesai"
            )
            TowingStage.FAILED -> TowingNextAction(
                type = TowingNextActionType.CONTACT_SUPPORT,
                label = "Hubungi Operasional",
                helperText = "Status perlu tindak lanjut dari tim operasional"
            )
            TowingStage.CANCELLED -> TowingNextAction(
                type = TowingNextActionType.NONE,
                label = "Dibatalkan",
                helperText = "Pesanan telah dibatalkan"
            )
        }

        val currentStepIndex = when (stage) {
            TowingStage.PENDING_OFFER -> 0
            TowingStage.NAVIGATING_TO_PICKUP -> 0
            TowingStage.ARRIVED_AT_PICKUP -> 1
            TowingStage.VERIFY_IDENTITY -> 2
            TowingStage.INSPECT_VEHICLE -> 3
            TowingStage.LOADING -> 4
            TowingStage.IN_TRANSIT -> 5
            TowingStage.ARRIVED_AT_DROPOFF -> 6
            TowingStage.UNLOADING -> 7
            TowingStage.COMPLETED -> 7
            TowingStage.FAILED -> -1
            TowingStage.CANCELLED -> -1
        }

        return TowingFlowState(
            stage = stage,
            title = when (stage) {
                TowingStage.PENDING_OFFER -> "Pesanan Baru"
                TowingStage.NAVIGATING_TO_PICKUP -> "Menuju Pickup"
                TowingStage.ARRIVED_AT_PICKUP -> "Tiba di Pickup"
                TowingStage.VERIFY_IDENTITY -> "Verifikasi Wajah"
                TowingStage.INSPECT_VEHICLE -> "Inspeksi Kendaraan"
                TowingStage.LOADING -> "Loading Kendaraan"
                TowingStage.IN_TRANSIT -> "Dalam Perjalanan"
                TowingStage.ARRIVED_AT_DROPOFF -> "Tiba di Tujuan"
                TowingStage.UNLOADING -> "Unloading Kendaraan"
                TowingStage.COMPLETED -> "Selesai"
                TowingStage.FAILED -> "Bermasalah"
                TowingStage.CANCELLED -> "Dibatalkan"
            },
            instruction = when (stage) {
                TowingStage.PENDING_OFFER -> "Review tawaran sebelum menerima pekerjaan."
                TowingStage.NAVIGATING_TO_PICKUP -> "Menuju lokasi kendaraan customer."
                TowingStage.ARRIVED_AT_PICKUP -> "Sudah tiba di lokasi pickup. Verifikasi wajah terlebih dahulu."
                TowingStage.VERIFY_IDENTITY -> "Scan wajah untuk membuktikan identitas."
                TowingStage.INSPECT_VEHICLE -> "Foto kondisi kendaraan sebelum diangkut."
                TowingStage.LOADING -> "Proses loading kendaraan ke tow truck."
                TowingStage.IN_TRANSIT -> "Perjalanan ke lokasi tujuan."
                TowingStage.ARRIVED_AT_DROPOFF -> "Sudah tiba di lokasi tujuan."
                TowingStage.UNLOADING -> "Turunkan kendaraan dari tow truck."
                TowingStage.COMPLETED -> "Layanan towing telah selesai."
                TowingStage.FAILED -> "Ikuti instruksi operasional untuk penyelesaian masalah."
                TowingStage.CANCELLED -> "Pesanan telah dibatalkan."
            },
            progressLabels = listOf("Perjalanan", "Pickup", "Verifikasi", "Inspeksi", "Loading", "Transit", "Tujuan", "Unloading"),
            currentStepIndex = currentStepIndex,
            pickupAddress = pickupAddress,
            dropoffAddress = dropoffAddress,
            nextAction = nextAction
        )
    }
}
