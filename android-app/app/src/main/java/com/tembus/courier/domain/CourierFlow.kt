package com.tembus.courier.domain

import com.tembus.courier.data.model.Order
import com.tembus.courier.data.model.normalizedWorkflowRole

enum class CourierStage {
    PENDING_OFFER,
    ASSIGNED,
    GOING_TO_PICKUP,
    ARRIVED_AT_PICKUP,
    PICKUP_FACE_REQUIRED,
    PICKUP_SCAN_REQUIRED,
    PICKUP_PHOTO_REQUIRED,
    PICKUP_VERIFIED,
    IN_TRANSIT,
    ARRIVED_AT_DROPOFF,
    DELIVERY_POD_REQUIRED,
    DELIVERED,
    FAILED,
    CANCEL_REQUESTED,
    CANCELLED,
    RETURN_TO_HUB
}

enum class CourierNextActionType {
    ACCEPT_OFFER,
    NAVIGATE_TO_PICKUP,
    MARK_PICKUP_ARRIVED,
    VERIFY_FACE_PICKUP,
    SCAN_PICKUP,
    CAPTURE_PICKUP_PHOTO,
    START_DELIVERY,
    NAVIGATE_TO_DROPOFF,
    CAPTURE_DELIVERY_PROOF,
    COMPLETE_DELIVERY,
    REPORT_FAILED_DELIVERY,
    CONTACT_SUPPORT,
    NONE
}

data class CourierNextAction(
    val type: CourierNextActionType,
    val label: String,
    val helperText: String,
    val targetStatus: String? = null
)

data class CourierFlowState(
    val stage: CourierStage,
    val title: String,
    val instruction: String,
    val progressLabels: List<String>,
    val activeAddress: String,
    val activeAddressLabel: String,
    val targetIsPickup: Boolean,
    val faceVerifiedForPickup: Boolean,
    val pickupScanDone: Boolean,
    val pickupPhotoDone: Boolean,
    val pickupDone: Boolean,
    val deliveryDone: Boolean,
    val nextAction: CourierNextAction,
    val secondaryAction: CourierNextAction? = null
)

object CourierFlowResolver {
    private val deliveredStatuses = setOf("delivered", "completed", "done", "selesai")
    private val failedStatuses = setOf("failed", "delivery_failed", "gagal")
    private val cancelledStatuses = setOf("cancelled", "canceled", "pickup_cancelled")
    private val cancelRequestStatuses = setOf("cancel_requested", "cancellation_requested")
    private val returnStatuses = setOf("return_required", "return_in_transit", "returned_to_hub", "returned_to_sender")
    private val pickupArrivedStatuses = setOf("pickup_arrived", "arrived_pickup", "arrived_at_pickup")
    private val pickupImpliedStatuses = setOf("picked_up", "pickup_verified", "in_transit") + deliveredStatuses
    private val activeDeliveryStatuses = setOf("in_transit", "picked_up", "pickup_verified")
    private val offerStatuses = setOf("pending_offer", "offer", "offered")

    fun resolve(
        order: Order,
        faceVerifiedForPickup: Boolean = false,
        pickupScanVerified: Boolean = false,
        pickupPhotoVerified: Boolean = false,
        pickupPhotoRequired: Boolean = true
    ): CourierFlowState {
        val status = order.status.trim().lowercase()
        val scanDone = pickupScanVerified ||
            order.pickupScanVerified ||
            order.scanType in setOf("pickup", "pickup_scan") ||
            status in pickupImpliedStatuses
        val photoDone = !pickupPhotoRequired ||
            pickupPhotoVerified ||
            order.pickupPhotoVerified ||
            order.scanType == "pickup_photo" ||
            status in pickupImpliedStatuses
        val pickupDone = scanDone && photoDone
        val deliveryDone = status in deliveredStatuses
        val role = order.normalizedWorkflowRole()
        val pickupArrivalRecorded = status in pickupArrivedStatuses || status in pickupImpliedStatuses
        val pickupAddress = order.pickupAddress.ifBlank { "Alamat pickup sedang disinkronkan" }
        val dropAddress = order.dropAddress.ifBlank { "Alamat tujuan sedang disinkronkan" }

        val stage = when {
            status in deliveredStatuses -> CourierStage.DELIVERED
            status in failedStatuses -> CourierStage.FAILED
            status in cancelledStatuses -> CourierStage.CANCELLED
            status in cancelRequestStatuses -> CourierStage.CANCEL_REQUESTED
            status in returnStatuses -> CourierStage.RETURN_TO_HUB
            status in offerStatuses -> CourierStage.PENDING_OFFER
            role == "on_demand" && !pickupArrivalRecorded && !pickupDone -> {
                if (status == "accepted") CourierStage.GOING_TO_PICKUP else CourierStage.ASSIGNED
            }
            role == "on_demand" && pickupArrivalRecorded && !faceVerifiedForPickup && !pickupDone -> CourierStage.ARRIVED_AT_PICKUP
            !faceVerifiedForPickup && !pickupDone -> CourierStage.PICKUP_FACE_REQUIRED
            !scanDone -> CourierStage.PICKUP_SCAN_REQUIRED
            !photoDone -> CourierStage.PICKUP_PHOTO_REQUIRED
            pickupDone && status !in activeDeliveryStatuses && status !in deliveredStatuses -> CourierStage.PICKUP_VERIFIED
            pickupDone && !deliveryDone -> CourierStage.DELIVERY_POD_REQUIRED
            else -> CourierStage.ASSIGNED
        }

        val nextAction = when (stage) {
            CourierStage.PENDING_OFFER -> CourierNextAction(
                type = CourierNextActionType.ACCEPT_OFFER,
                label = "Terima Order",
                helperText = "Konfirmasi pekerjaan sebelum mulai pickup."
            )
            CourierStage.PICKUP_FACE_REQUIRED -> CourierNextAction(
                type = CourierNextActionType.VERIFY_FACE_PICKUP,
                label = "Verifikasi Wajah",
                helperText = "Scan wajah untuk membuktikan kamu yang mengambil barang ini."
            )
            CourierStage.ARRIVED_AT_PICKUP -> CourierNextAction(
                type = CourierNextActionType.VERIFY_FACE_PICKUP,
                label = "Verifikasi Wajah",
                helperText = "Kamu sudah tiba. Verifikasi wajah sebelum memeriksa paket."
            )
            CourierStage.PICKUP_SCAN_REQUIRED -> CourierNextAction(
                type = CourierNextActionType.SCAN_PICKUP,
                label = "Scan Kode Paket",
                helperText = "Cocokkan paket dengan order aktif di titik pickup."
            )
            CourierStage.PICKUP_PHOTO_REQUIRED -> CourierNextAction(
                type = CourierNextActionType.CAPTURE_PICKUP_PHOTO,
                label = "Foto Barang Saat Pickup",
                helperText = "Ambil bukti kondisi barang sebelum mulai antar."
            )
            CourierStage.PICKUP_VERIFIED -> CourierNextAction(
                type = CourierNextActionType.START_DELIVERY,
                label = "Mulai Antar",
                helperText = "Pickup lengkap. Lanjutkan perjalanan ke penerima.",
                targetStatus = "in_transit"
            )
            CourierStage.IN_TRANSIT,
            CourierStage.ARRIVED_AT_DROPOFF,
            CourierStage.DELIVERY_POD_REQUIRED -> CourierNextAction(
                type = CourierNextActionType.CAPTURE_DELIVERY_PROOF,
                label = "Ambil Bukti Terima",
                helperText = "Ambil bukti serah terima di titik penerima."
            )
            CourierStage.FAILED,
            CourierStage.CANCEL_REQUESTED,
            CourierStage.RETURN_TO_HUB -> CourierNextAction(
                type = CourierNextActionType.CONTACT_SUPPORT,
                label = "Hubungi Operasional",
                helperText = "Status perlu tindak lanjut dari tim operasional."
            )
            CourierStage.CANCELLED,
            CourierStage.DELIVERED -> CourierNextAction(
                type = CourierNextActionType.NONE,
                label = "Tidak ada aksi",
                helperText = "Pekerjaan ini sudah selesai atau tidak aktif."
            )
            CourierStage.ASSIGNED -> CourierNextAction(
                type = CourierNextActionType.NAVIGATE_TO_PICKUP,
                label = "Navigasi ke Pickup",
                helperText = "Datang ke titik pickup untuk mulai verifikasi barang."
            )
            CourierStage.GOING_TO_PICKUP -> CourierNextAction(
                type = CourierNextActionType.MARK_PICKUP_ARRIVED,
                label = "Saya sudah tiba di pickup",
                helperText = "Konfirmasi tiba sebelum verifikasi wajah dan pemeriksaan paket.",
                targetStatus = "pickup_arrived"
            )
        }

        val title = when (stage) {
            CourierStage.PENDING_OFFER -> "Pesanan baru"
            CourierStage.PICKUP_FACE_REQUIRED -> "Verifikasi wajah dulu"
            CourierStage.PICKUP_SCAN_REQUIRED,
            CourierStage.PICKUP_PHOTO_REQUIRED,
            CourierStage.ASSIGNED,
            CourierStage.GOING_TO_PICKUP,
            CourierStage.ARRIVED_AT_PICKUP -> "Tiba di pickup"
            CourierStage.PICKUP_VERIFIED -> "Pickup lengkap"
            CourierStage.IN_TRANSIT,
            CourierStage.ARRIVED_AT_DROPOFF,
            CourierStage.DELIVERY_POD_REQUIRED -> "Menuju penerima"
            CourierStage.DELIVERED -> "Pekerjaan selesai"
            CourierStage.FAILED -> "Pengiriman bermasalah"
            CourierStage.CANCEL_REQUESTED -> "Pembatalan diproses"
            CourierStage.CANCELLED -> "Pickup dibatalkan"
            CourierStage.RETURN_TO_HUB -> "Return diperlukan"
        }

        val instruction = when (stage) {
            CourierStage.PICKUP_FACE_REQUIRED -> "Scan wajah terlebih dahulu untuk memulai verifikasi pickup barang."
            CourierStage.ARRIVED_AT_PICKUP -> "Kamu sudah tiba di pickup. Scan wajah terlebih dahulu sebelum memeriksa paket."
            CourierStage.PICKUP_SCAN_REQUIRED -> "Scan atau input kode paket saat barang sudah siap diverifikasi."
            CourierStage.PICKUP_PHOTO_REQUIRED -> "Scan sudah tercatat. Lengkapi foto barang pickup."
            CourierStage.PICKUP_VERIFIED -> "Semua bukti pickup sudah lengkap. Mulai antar ke penerima."
            CourierStage.DELIVERY_POD_REQUIRED -> "Antarkan paket ke penerima, lalu ambil bukti terima."
            CourierStage.DELIVERED -> "Bukti selesai sudah tercatat."
            CourierStage.FAILED -> "Ikuti instruksi operasional untuk penyelesaian masalah."
            CourierStage.CANCEL_REQUESTED -> "Menunggu hasil pembatalan dari operasional."
            CourierStage.CANCELLED -> "Pekerjaan tidak lagi aktif."
            CourierStage.RETURN_TO_HUB -> "Kembalikan paket sesuai arahan operasional."
            CourierStage.PENDING_OFFER -> "Review tawaran sebelum menerima pekerjaan."
            else -> if (role == "regular") {
                "Jalankan order regular sesuai tahap pengiriman."
            } else {
                "Datang ke titik pickup, konfirmasi tiba, lalu verifikasi wajah sebelum scan barang."
            }
        }

        val targetIsPickup = stage in setOf(
            CourierStage.PENDING_OFFER,
            CourierStage.ASSIGNED,
            CourierStage.GOING_TO_PICKUP,
            CourierStage.ARRIVED_AT_PICKUP,
            CourierStage.PICKUP_FACE_REQUIRED,
            CourierStage.PICKUP_SCAN_REQUIRED,
            CourierStage.PICKUP_PHOTO_REQUIRED
        )

        return CourierFlowState(
            stage = stage,
            title = title,
            instruction = instruction,
            progressLabels = listOf("Verifikasi Wajah", "Pickup", "Antar", "Bukti Terima"),
            activeAddress = if (targetIsPickup) pickupAddress else dropAddress,
            activeAddressLabel = if (targetIsPickup) "Lokasi pickup" else "Lokasi penerima",
            targetIsPickup = targetIsPickup,
            faceVerifiedForPickup = faceVerifiedForPickup,
            pickupScanDone = scanDone,
            pickupPhotoDone = photoDone,
            pickupDone = pickupDone,
            deliveryDone = deliveryDone,
            nextAction = nextAction,
            secondaryAction = if (role == "on_demand" && stage == CourierStage.DELIVERY_POD_REQUIRED) {
                CourierNextAction(
                    type = CourierNextActionType.REPORT_FAILED_DELIVERY,
                    label = "Penerima Tidak Ada",
                    helperText = "Laporkan jika penerima tidak bisa ditemui. Tim operasional akan membantu."
                )
            } else null
        )
    }
}

object CourierProofTypes {
    const val PICKUP_SCAN = "pickup_scan"
    const val PICKUP_PHOTO = "pickup_photo"
    const val DELIVERY_POD_PHOTO = "delivery_pod_photo"
    const val DELIVERY_SIGNATURE = "delivery_signature"
    const val CANCEL_PICKUP_PHOTO = "cancel_pickup_photo"
    const val FAILED_DELIVERY_PHOTO = "failed_delivery_photo"
    // S2-COURIER-04: OTP verification types for anti-fraud
    const val PICKUP_OTP = "pickup_otp"
    const val DELIVERY_OTP = "delivery_otp"

    fun normalize(value: String): String {
        return when (value.trim().lowercase()) {
            "pickup", PICKUP_PHOTO -> PICKUP_PHOTO
            "pickup_scan" -> PICKUP_SCAN
            "delivery", "pod", "delivery_pod", DELIVERY_POD_PHOTO -> DELIVERY_POD_PHOTO
            "signature", DELIVERY_SIGNATURE -> DELIVERY_SIGNATURE
            "cancel_pickup", "pickup_cancellation", CANCEL_PICKUP_PHOTO -> CANCEL_PICKUP_PHOTO
            "failed_delivery", FAILED_DELIVERY_PHOTO -> FAILED_DELIVERY_PHOTO
            "pickup_otp", PICKUP_OTP -> PICKUP_OTP
            "delivery_otp", DELIVERY_OTP -> DELIVERY_OTP
            else -> value.trim().lowercase().ifBlank { DELIVERY_POD_PHOTO }
        }
    }

    fun isPickupProof(value: String): Boolean = normalize(value) in setOf(PICKUP_SCAN, PICKUP_PHOTO, PICKUP_OTP)

    fun isDeliveryProof(value: String): Boolean = normalize(value) in setOf(DELIVERY_POD_PHOTO, DELIVERY_SIGNATURE, DELIVERY_OTP)

    fun isOtpProof(value: String): Boolean = normalize(value) in setOf(PICKUP_OTP, DELIVERY_OTP)
}
