package com.tembus.courier.domain

import com.tembus.courier.data.model.Order

// ============================================================
// TAMAL BAN FLOW — State Machine
// ============================================================

enum class TambalBanStage {
    PENDING_OFFER,
    NAVIGATING_TO_LOCATION,
    ARRIVED_AT_LOCATION,
    VERIFY_IDENTITY,
    INSPECT_TIRE,
    SERVICE_IN_PROGRESS,
    SERVICE_COMPLETE,
    COMPLETED,
    FAILED,
    CANCELLED
}

enum class TambalBanNextActionType {
    ACCEPT_OFFER,
    NAVIGATE_TO_LOCATION,
    ARRIVED_AT_LOCATION,
    VERIFY_FACE,
    CAPTURE_INSPECTION,
    START_SERVICE,
    COMPLETE_SERVICE,
    CAPTURE_COMPLETION,
    CONTACT_SUPPORT,
    NONE
}

data class TambalBanNextAction(
    val type: TambalBanNextActionType,
    val label: String,
    val helperText: String,
    val targetStatus: String? = null
)

data class TambalBanFlowState(
    val stage: TambalBanStage,
    val title: String,
    val instruction: String,
    val progressLabels: List<String>,
    val currentStepIndex: Int,
    val activeAddress: String,
    val activeAddressLabel: String,
    val nextAction: TambalBanNextAction,
    val secondaryAction: TambalBanNextAction? = null
)

object TambalBanFlowResolver {
    private val completedStatuses = setOf("completed", "done", "selesai", "delivered")
    private val failedStatuses = setOf("failed", "gagal")
    private val cancelledStatuses = setOf("cancelled", "canceled")
    private val offerStatuses = setOf("pending_offer", "offer", "offered")

    fun resolve(
        order: Order,
        faceVerified: Boolean = false,
        inspectionDone: Boolean = false,
        serviceComplete: Boolean = false
    ): TambalBanFlowState {
        val status = order.status.trim().lowercase()
        val pickupAddress = order.pickupAddress.ifBlank { "Alamat lokasi sedang disinkronkan" }

        val stage = when {
            status in completedStatuses -> TambalBanStage.COMPLETED
            status in failedStatuses -> TambalBanStage.FAILED
            status in cancelledStatuses -> TambalBanStage.CANCELLED
            status in offerStatuses -> TambalBanStage.PENDING_OFFER
            status == "arriving" || status == "navigating" || status == "accepted" -> TambalBanStage.NAVIGATING_TO_LOCATION
            status in setOf("arrived", "pickup_arrived") && !faceVerified -> TambalBanStage.ARRIVED_AT_LOCATION
            status in setOf("arrived", "pickup_arrived") && faceVerified && !inspectionDone -> TambalBanStage.VERIFY_IDENTITY
            status == "verifying" || status == "picking_up" -> TambalBanStage.VERIFY_IDENTITY
            status == "inspecting" -> TambalBanStage.INSPECT_TIRE
            status == "in_progress" || status == "working" || status == "picked_up" -> TambalBanStage.SERVICE_IN_PROGRESS
            status == "service_complete" || status == "completed_service" || status == "delivering" || status == "report_submitted" -> TambalBanStage.SERVICE_COMPLETE
            else -> TambalBanStage.NAVIGATING_TO_LOCATION
        }

        val nextAction = when (stage) {
            TambalBanStage.PENDING_OFFER -> TambalBanNextAction(
                type = TambalBanNextActionType.ACCEPT_OFFER,
                label = "Terima Order",
                helperText = "Terima pesanan tambal ban dari customer"
            )
            TambalBanStage.NAVIGATING_TO_LOCATION -> TambalBanNextAction(
                type = TambalBanNextActionType.NAVIGATE_TO_LOCATION,
                label = "Navigasi ke Lokasi",
                helperText = "Menuju lokasi kendaraan customer"
            )
            TambalBanStage.ARRIVED_AT_LOCATION -> TambalBanNextAction(
                type = TambalBanNextActionType.ARRIVED_AT_LOCATION,
                label = "Tiba di Lokasi",
                helperText = "Verifikasi wajah terlebih dahulu"
            )
            TambalBanStage.VERIFY_IDENTITY -> TambalBanNextAction(
                type = TambalBanNextActionType.VERIFY_FACE,
                label = "Verifikasi Wajah",
                helperText = "Scan wajah untuk membuktikan identitas"
            )
            TambalBanStage.INSPECT_TIRE -> TambalBanNextAction(
                type = TambalBanNextActionType.CAPTURE_INSPECTION,
                label = "Foto Kondisi Ban",
                helperText = "Foto ban sebelum diperbaiki sebagai bukti"
            )
            TambalBanStage.SERVICE_IN_PROGRESS -> TambalBanNextAction(
                type = TambalBanNextActionType.COMPLETE_SERVICE,
                label = "Tandai Selesai",
                helperText = "Kerjakan tambal ban, tandai saat selesai"
            )
            TambalBanStage.SERVICE_COMPLETE -> TambalBanNextAction(
                type = TambalBanNextActionType.CAPTURE_COMPLETION,
                label = "Foto Hasil Perbaikan",
                helperText = "Foto ban setelah diperbaiki sebagai bukti"
            )
            TambalBanStage.COMPLETED -> TambalBanNextAction(
                type = TambalBanNextActionType.NONE,
                label = "Selesai",
                helperText = "Layanan tambal ban telah selesai"
            )
            TambalBanStage.FAILED -> TambalBanNextAction(
                type = TambalBanNextActionType.CONTACT_SUPPORT,
                label = "Hubungi Operasional",
                helperText = "Status perlu tindak lanjut dari tim operasional"
            )
            TambalBanStage.CANCELLED -> TambalBanNextAction(
                type = TambalBanNextActionType.NONE,
                label = "Dibatalkan",
                helperText = "Pesanan telah dibatalkan"
            )
        }

        val currentStepIndex = when (stage) {
            TambalBanStage.PENDING_OFFER -> 0
            TambalBanStage.NAVIGATING_TO_LOCATION -> 0
            TambalBanStage.ARRIVED_AT_LOCATION -> 1
            TambalBanStage.VERIFY_IDENTITY -> 2
            TambalBanStage.INSPECT_TIRE -> 3
            TambalBanStage.SERVICE_IN_PROGRESS -> 4
            TambalBanStage.SERVICE_COMPLETE -> 4
            TambalBanStage.COMPLETED -> 5
            TambalBanStage.FAILED -> -1
            TambalBanStage.CANCELLED -> -1
        }

        return TambalBanFlowState(
            stage = stage,
            title = when (stage) {
                TambalBanStage.PENDING_OFFER -> "Pesanan Baru"
                TambalBanStage.NAVIGATING_TO_LOCATION -> "Menuju Lokasi"
                TambalBanStage.ARRIVED_AT_LOCATION -> "Tiba di Lokasi"
                TambalBanStage.VERIFY_IDENTITY -> "Verifikasi Wajah"
                TambalBanStage.INSPECT_TIRE -> "Inspeksi Ban"
                TambalBanStage.SERVICE_IN_PROGRESS -> "Sedang Mengerjakan"
                TambalBanStage.SERVICE_COMPLETE -> "Layanan Selesai"
                TambalBanStage.COMPLETED -> "Selesai"
                TambalBanStage.FAILED -> " Bermasalah"
                TambalBanStage.CANCELLED -> "Dibatalkan"
            },
            instruction = when (stage) {
                TambalBanStage.PENDING_OFFER -> "Review tawaran sebelum menerima pekerjaan."
                TambalBanStage.NAVIGATING_TO_LOCATION -> "Menuju lokasi kendaraan customer."
                TambalBanStage.ARRIVED_AT_LOCATION -> "Sudah tiba di lokasi. Verifikasi wajah terlebih dahulu."
                TambalBanStage.VERIFY_IDENTITY -> "Scan wajah untuk membuktikan identitas."
                TambalBanStage.INSPECT_TIRE -> "Foto kondisi ban sebelum diperbaiki."
                TambalBanStage.SERVICE_IN_PROGRESS -> "Kerjakan tambal ban. Tandai saat selesai."
                TambalBanStage.SERVICE_COMPLETE -> "Foto hasil perbaikan ban."
                TambalBanStage.COMPLETED -> "Layanan tambal ban telah selesai."
                TambalBanStage.FAILED -> "Ikuti instruksi operasional untuk penyelesaian masalah."
                TambalBanStage.CANCELLED -> "Pesanan telah dibatalkan."
            },
            progressLabels = listOf("Perjalanan", "Tiba", "Verifikasi", "Inspeksi", "Kerja", "Selesai"),
            currentStepIndex = currentStepIndex,
            activeAddress = pickupAddress,
            activeAddressLabel = "Lokasi Service",
            nextAction = nextAction
        )
    }
}
