package com.tembus.courier.domain

import com.tembus.courier.data.model.Order
import com.tembus.courier.data.model.normalizedWorkflowRole
import com.tembus.courier.data.model.isFoodDeliveryOrder

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
        val foodOrder = order.isFoodDeliveryOrder()

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
                label = if (foodOrder) "Terima Order Food" else "Terima Order",
                helperText = if (foodOrder) "Periksa resto, item, tujuan, dan pendapatan sebelum menerima tawaran." else "Konfirmasi pekerjaan sebelum mulai pickup."
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
                label = if (foodOrder) "Verifikasi Handoff Resto" else "Scan Kode Paket",
                helperText = if (foodOrder) "Scan QR/PIN dari merchant. Server akan mengikat order, resto, kurir, dan status pickup." else "Cocokkan paket dengan order aktif di titik pickup."
            )
            CourierStage.PICKUP_PHOTO_REQUIRED -> CourierNextAction(
                type = CourierNextActionType.CAPTURE_PICKUP_PHOTO,
                label = if (foodOrder) "Foto Pesanan Sebelum Berangkat" else "Foto Barang Saat Pickup",
                helperText = if (foodOrder) "Pastikan item dan kemasan terlihat sebelum makanan dibawa ke customer." else "Ambil bukti kondisi barang sebelum mulai antar."
            )
            CourierStage.PICKUP_VERIFIED -> CourierNextAction(
                type = CourierNextActionType.START_DELIVERY,
                label = if (foodOrder) "Mulai Antar ke Customer" else "Mulai Antar",
                helperText = if (foodOrder) "Handoff resto sudah terverifikasi. Jaga kemasan dan lanjutkan ke customer." else "Pickup lengkap. Lanjutkan perjalanan ke penerima.",
                targetStatus = "in_transit"
            )
            CourierStage.IN_TRANSIT,
            CourierStage.ARRIVED_AT_DROPOFF,
            CourierStage.DELIVERY_POD_REQUIRED -> CourierNextAction(
                type = CourierNextActionType.CAPTURE_DELIVERY_PROOF,
                label = if (foodOrder) "Selesaikan Serah-terima Food" else "Ambil Bukti Terima",
                helperText = if (foodOrder && order.contactless) "Letakkan sesuai instruksi customer dan ambil POD foto. Jangan minta tanda tangan fisik." else if (foodOrder) "Konfirmasi nama/order atau OTP lalu ambil POD sesuai instruksi customer." else "Ambil bukti serah terima di titik penerima."
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
                label = if (foodOrder) "Navigasi ke Resto" else "Navigasi ke Pickup",
                helperText = if (foodOrder) "Datang ke resto untuk mengambil pesanan dan mulai handoff merchant." else "Datang ke titik pickup untuk mulai verifikasi barang."
            )
            CourierStage.GOING_TO_PICKUP -> CourierNextAction(
                type = CourierNextActionType.MARK_PICKUP_ARRIVED,
                label = if (foodOrder) "Saya sudah tiba di resto" else "Saya sudah tiba di pickup",
                helperText = if (foodOrder) "Konfirmasi tiba sebelum verifikasi merchant dan QR/PIN handoff." else "Konfirmasi tiba sebelum verifikasi wajah dan pemeriksaan paket.",
                targetStatus = "pickup_arrived"
            )
        }

        val title = when (stage) {
            CourierStage.PENDING_OFFER -> if (foodOrder) "Tawaran food baru" else "Pesanan baru"
            CourierStage.PICKUP_FACE_REQUIRED -> "Verifikasi wajah dulu"
            CourierStage.PICKUP_SCAN_REQUIRED,
            CourierStage.PICKUP_PHOTO_REQUIRED,
            CourierStage.ASSIGNED,
            CourierStage.GOING_TO_PICKUP,
            CourierStage.ARRIVED_AT_PICKUP -> if (foodOrder) "Menuju / ambil di resto" else "Tiba di pickup"
            CourierStage.PICKUP_VERIFIED -> if (foodOrder) "Pesanan siap diantar" else "Pickup lengkap"
            CourierStage.IN_TRANSIT,
            CourierStage.ARRIVED_AT_DROPOFF,
            CourierStage.DELIVERY_POD_REQUIRED -> if (foodOrder) "Antar ke customer" else "Menuju penerima"
            CourierStage.DELIVERED -> "Pekerjaan selesai"
            CourierStage.FAILED -> "Pengiriman bermasalah"
            CourierStage.CANCEL_REQUESTED -> "Pembatalan diproses"
            CourierStage.CANCELLED -> "Pickup dibatalkan"
            CourierStage.RETURN_TO_HUB -> "Return diperlukan"
        }

        val instruction = when (stage) {
            CourierStage.PICKUP_FACE_REQUIRED -> if (foodOrder) "Verifikasi wajah sebelum handoff dengan merchant." else "Scan wajah terlebih dahulu untuk memulai verifikasi pickup barang."
            CourierStage.ARRIVED_AT_PICKUP -> if (foodOrder) "Kamu sudah tiba di resto. Verifikasi wajah lalu cocokkan order dengan merchant." else "Kamu sudah tiba di pickup. Scan wajah terlebih dahulu sebelum memeriksa paket."
            CourierStage.PICKUP_SCAN_REQUIRED -> if (foodOrder) "Scan QR/PIN handoff merchant saat pesanan sudah siap." else "Scan atau input kode paket saat barang sudah siap diverifikasi."
            CourierStage.PICKUP_PHOTO_REQUIRED -> if (foodOrder) "Handoff resto tercatat. Lengkapi foto kemasan sebelum berangkat." else "Scan sudah tercatat. Lengkapi foto barang pickup."
            CourierStage.PICKUP_VERIFIED -> if (foodOrder) "Item dan handoff resto lengkap. Mulai antar ke customer." else "Semua bukti pickup sudah lengkap. Mulai antar ke penerima."
            CourierStage.DELIVERY_POD_REQUIRED -> if (foodOrder && order.contactless) "Letakkan makanan sesuai instruksi customer, lalu ambil POD foto." else if (foodOrder) "Konfirmasi customer dengan nama/order atau OTP, lalu ambil POD." else "Antarkan paket ke penerima, lalu ambil bukti terima."
            CourierStage.DELIVERED -> "Bukti selesai sudah tercatat."
            CourierStage.FAILED -> "Ikuti instruksi operasional untuk penyelesaian masalah."
            CourierStage.CANCEL_REQUESTED -> "Menunggu hasil pembatalan dari operasional."
            CourierStage.CANCELLED -> "Pekerjaan tidak lagi aktif."
            CourierStage.RETURN_TO_HUB -> "Kembalikan paket sesuai arahan operasional."
            CourierStage.PENDING_OFFER -> if (foodOrder) "Review resto, rincian menu, rute, dan pendapatan sebelum menerima." else "Review tawaran sebelum menerima pekerjaan."
            else -> if (foodOrder) "Datang ke resto, konfirmasi tiba, verifikasi handoff, lalu jaga pesanan sampai customer." else "Datang ke titik pickup, konfirmasi tiba, lalu verifikasi wajah sebelum scan barang."
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
            progressLabels = if (foodOrder) listOf("Terima order", "Ambil di resto", "Dalam perjalanan", "Serah-terima") else listOf("Verifikasi Wajah", "Pickup", "Antar", "Bukti Terima"),
            activeAddress = if (targetIsPickup) pickupAddress else dropAddress,
            activeAddressLabel = if (targetIsPickup) (if (foodOrder) "Lokasi resto" else "Lokasi pickup") else (if (foodOrder) "Lokasi customer" else "Lokasi penerima"),
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

    /**
     * Contactless delivery is intentionally photo-only: the courier must
     * prove the drop-off location, but must not request a physical receiver
     * signature. The backend still requires the delivery photo.
     */
    fun requiresSignatureForDelivery(contactless: Boolean, proofMode: String): Boolean =
        !contactless && isDeliveryProof(proofMode)

    fun isOtpProof(value: String): Boolean = normalize(value) in setOf(PICKUP_OTP, DELIVERY_OTP)
}
