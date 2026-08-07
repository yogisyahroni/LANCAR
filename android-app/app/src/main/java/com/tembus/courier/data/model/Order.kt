package com.tembus.courier.data.model

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class CourierOrderPackage(
    @SerialName("package_id")
    val packageId: String? = null,
    @SerialName("id")
    val id: String? = null,
    @SerialName("package_code")
    val packageCode: String? = null,
    @SerialName("description")
    val description: String? = null,
    @SerialName("size_tier")
    val sizeTier: String? = null,
    @SerialName("weight_kg")
    val weightKg: Double? = null,
    @SerialName("status")
    val status: String = "pending",
    @SerialName("pickup_scan_verified_at")
    val pickupScanVerifiedAt: String? = null,
    @SerialName("pickup_photo_verified_at")
    val pickupPhotoVerifiedAt: String? = null,
    @SerialName("delivery_pod_verified_at")
    val deliveryPodVerifiedAt: String? = null
) {
    fun stableId(): String = packageId?.takeIf { it.isNotBlank() } ?: id?.takeIf { it.isNotBlank() } ?: displayCode()
    fun displayCode(): String = packageCode?.takeIf { it.isNotBlank() }
        ?: packageId?.take(8)?.ifBlank { null }
        ?: id?.take(8)?.ifBlank { null }
        ?: "Paket"
    fun pickupScanDone(): Boolean = !pickupScanVerifiedAt.isNullOrBlank() || status in setOf("pickup_scanned", "pickup_verified", "in_transit", "pod_verified", "delivered")
    fun pickupPhotoDone(): Boolean = !pickupPhotoVerifiedAt.isNullOrBlank() || status in setOf("pickup_verified", "in_transit", "pod_verified", "delivered")
    fun podDone(): Boolean = !deliveryPodVerifiedAt.isNullOrBlank() || status in setOf("pod_verified", "delivered")
}

@Serializable
data class TambalBanReport(
    @SerialName("vehicle_type") val vehicleType: String? = null,
    @SerialName("ban_bocor") val banBocor: Boolean = false,
    @SerialName("ban_pecah") val banPecah: Boolean = false,
    @SerialName("velg_rusak") val velgRusak: Boolean = false,
    @SerialName("pentil_rusak") val pentilRusak: Boolean = false,
    @SerialName("catatan_teknisi") val catatanTeknisi: String? = null
)

@Serializable
data class TowingReport(
    @SerialName("vehicle_type") val vehicleType: String? = null,
    @SerialName("vehicle_condition") val vehicleCondition: String? = null,
    @SerialName("towing_type") val towingType: String? = null,
    @SerialName("wheel_position") val wheelPosition: String? = null,
    @SerialName("driver_notes") val driverNotes: String? = null
)

/**
 * Order Model for TEMBUS Courier App
 *
 * Represents an order assigned to a courier for delivery.
 * Used for both API communication and local database storage.
 */
@Entity(
    tableName = "orders",
    indices = [
        Index(value = ["order_id"]),
        Index(value = ["status"]),
        Index(value = ["needsSync"]),
        Index(value = ["needsScanSync"]),
        Index(value = ["needsPodSync"])
    ]
)
@Serializable
data class Order(
    @PrimaryKey(autoGenerate = true)
    @ColumnInfo(name = "id")
    @SerialName("id")
    val localId: Long = 0,

    @ColumnInfo(name = "order_id")
    @SerialName("order_id")
    val orderId: String = "",

    @ColumnInfo(name = "batch_id")
    @SerialName("batch_id")
    val batchId: String? = null,

    @ColumnInfo(name = "sequence_no")
    @SerialName("sequence_no")
    val sequenceNo: Int? = null,

    @ColumnInfo(name = "pickup_address")
    @SerialName("pickup_address")
    val pickupAddress: String = "",

    @ColumnInfo(name = "pickup_latitude")
    @SerialName("pickup_latitude")
    val pickupLatitude: Double? = null,

    @ColumnInfo(name = "pickup_longitude")
    @SerialName("pickup_longitude")
    val pickupLongitude: Double? = null,

    @ColumnInfo(name = "pickup_time")
    @SerialName("pickup_time")
    val pickupTime: String = "",

    @ColumnInfo(name = "drop_address")
    @SerialName("drop_address")
    val dropAddress: String = "",

    @ColumnInfo(name = "drop_latitude")
    @SerialName("drop_latitude")
    val dropLatitude: Double? = null,

    @ColumnInfo(name = "drop_longitude")
    @SerialName("drop_longitude")
    val dropLongitude: Double? = null,

    @ColumnInfo(name = "distance")
    @SerialName("distance")
    val distance: String = "",

    @ColumnInfo(name = "fee")
    @SerialName("fee")
    val fee: String = "",

    // FB-077: tip dari customer (Rp). 0 = belum di-tip.
    @ColumnInfo(name = "tip_amount_idr")
    @SerialName("tip_amount_idr")
    val tipAmountIdr: Long = 0,

    @ColumnInfo(name = "courier_payout_estimate_idr")
    @SerialName("courier_payout_estimate_idr")
    val courierPayoutEstimateIdr: Int = 0,

    @ColumnInfo(name = "customer_price_idr")
    @SerialName("customer_price_idr")
    val customerPriceIdr: Int = 0,

    @ColumnInfo(name = "platform_commission_idr")
    @SerialName("platform_commission_idr")
    val platformCommissionIdr: Int = 0,

    @ColumnInfo(name = "service_code")
    @SerialName("service_code")
    val serviceCode: String? = null,

    @ColumnInfo(name = "service_name")
    @SerialName("service_name")
    val serviceName: String? = null,

    @ColumnInfo(name = "service_category")
    @SerialName("service_category")
    val serviceCategory: String? = null,

    @ColumnInfo(name = "service_family")
    @SerialName("service_family")
    val serviceFamily: String? = null,

    @ColumnInfo(name = "service_route_model")
    @SerialName("service_route_model")
    val serviceRouteModel: String? = null,

    @ColumnInfo(name = "service_max_eta_minutes")
    @SerialName("service_max_eta_minutes")
    val serviceMaxEtaMinutes: Int = 0,

    @ColumnInfo(name = "package_count")
    @SerialName("package_count")
    val packageCount: Int = 1,

    @ColumnInfo(name = "packages")
    @SerialName("packages")
    val packages: List<CourierOrderPackage> = emptyList(),

    @ColumnInfo(name = "service_max_packages_per_order")
    @SerialName("service_max_packages_per_order")
    val serviceMaxPackagesPerOrder: Int = 1,

    @ColumnInfo(name = "service_max_active_orders_on_demand")
    @SerialName("service_max_active_orders_on_demand")
    val serviceMaxActiveOrdersOnDemand: Int = 1,

    @ColumnInfo(name = "service_face_verification_required")
    @SerialName("service_face_verification_required")
    val serviceFaceVerificationRequired: Boolean = true,

    @ColumnInfo(name = "service_proof_geofence_radius_m")
    @SerialName("service_proof_geofence_radius_m")
    val serviceProofGeofenceRadiusM: Int = 10,

    @ColumnInfo(name = "service_proof_min_accuracy_m")
    @SerialName("service_proof_min_accuracy_m")
    val serviceProofMinAccuracyM: Int = 50,

    @ColumnInfo(name = "service_failed_delivery_policy")
    @SerialName("service_failed_delivery_policy")
    val serviceFailedDeliveryPolicy: String = "must_deliver",

    @ColumnInfo(name = "item_description")
    @SerialName("item_description")
    val itemDescription: String? = null,

    @ColumnInfo(name = "item_image_url")
    @SerialName("item_image_url")
    val itemImageUrl: String? = null,

    @ColumnInfo(name = "model")
    @SerialName("model")
    val model: String = "P2P",

    @ColumnInfo(name = "leg_number")
    @SerialName("leg_number")
    val legNumber: Int = 1,

    @ColumnInfo(name = "workflow_role")
    @SerialName("workflow_role")
    val workflowRole: String = "on_demand",
    @ColumnInfo(name = "dispatch_id")
    @SerialName("dispatch_id")
    val dispatchId: String? = null,

    @ColumnInfo(name = "offer_expires_at")
    @SerialName("offer_expires_at")
    val offerExpiresAt: Long? = null,

    @ColumnInfo(name = "offer_ttl_seconds")
    @SerialName("offer_ttl_seconds")
    val offerTtlSeconds: Int? = null,

    @ColumnInfo(name = "customer_name")
    @SerialName("customer_name")
    val customerName: String = "",

    /**
     * Order status: pending, assigned, picked_up, in_transit, delivered, failed
     */
    @ColumnInfo(name = "status")
    @SerialName("status")
    val status: String = "pending",

    /**
     * Timestamp when order was created/received
     */
    @ColumnInfo(name = "created_at")
    @SerialName("created_at")
    val createdAt: Long = System.currentTimeMillis(),

    /**
     * Timestamp when order status was last updated
     */
    @ColumnInfo(name = "updated_at")
    @SerialName("updated_at")
    var updatedAt: Long = System.currentTimeMillis(),

    @ColumnInfo(name = "needsSync")
    var needsSync: Boolean = true,

    /**
     * Flag indicating if scan data needs to be synced with backend
     */
    @ColumnInfo(name = "needsScanSync")
    var needsScanSync: Boolean = false,

    /**
     * Flag indicating if PoD data needs to be synced with backend
     */
    @ColumnInfo(name = "needsPodSync")
    var needsPodSync: Boolean = false,

    /**
     * Latitude of scan
     */
    @ColumnInfo(name = "scan_latitude")
    @SerialName("scan_latitude")
    var scanLatitude: Double? = null,

    /**
     * Longitude of scan
     */
    @ColumnInfo(name = "scan_longitude")
    @SerialName("scan_longitude")
    var scanLongitude: Double? = null,

    /**
     * Type of scan (e.g. 'pickup')
     */
    @ColumnInfo(name = "scan_type")
    @SerialName("scan_type")
    var scanType: String? = null,

    /**
     * Proof of delivery image URI (local file path)
     */
    @ColumnInfo(name = "pod_image_uri")
    @SerialName("pod_image_uri")
    var podImageUri: String? = null,

    /**
     * Explicit proof type for the local image queued for sync.
     */
    @ColumnInfo(name = "pod_proof_type")
    @SerialName("pod_proof_type")
    var podProofType: String? = null,

    /**
     * Timestamp when the latest proof was confirmed by backend sync.
     */
    @ColumnInfo(name = "proof_synced_at")
    @SerialName("proof_synced_at")
    var proofSyncedAt: Long? = null,

    /**
     * Timestamp when pickup scan/photo evidence last changed locally.
     */
    @ColumnInfo(name = "pickup_evidence_updated_at")
    @SerialName("pickup_evidence_updated_at")
    var pickupEvidenceUpdatedAt: Long? = null,

    /**
     * Signature data (base64 encoded or file path)
     */
    @ColumnInfo(name = "signature_data")
    @SerialName("signature_data")
    var signatureData: String? = null,

    /**
     * Delivery notes/comments
     */
    @ColumnInfo(name = "delivery_notes")
    @SerialName("delivery_notes")
    var deliveryNotes: String? = null,

    /**
     * Customer phone number for contact
     */
    @ColumnInfo(name = "customer_phone")
    @SerialName("customer_phone")
    var phoneNumber: String? = null,

    @ColumnInfo(name = "pickup_scan_verified")
    @SerialName("pickup_scan_verified")
    val pickupScanVerified: Boolean = false,

    @ColumnInfo(name = "pickup_photo_verified")
    @SerialName("pickup_photo_verified")
    val pickupPhotoVerified: Boolean = false,

    /**
     * FB-089: contactless delivery — antar tanpa kontak fisik
     * (letakkan paket di lokasi). POD foto tetap wajib.
     */
    @ColumnInfo(name = "contactless")
    @SerialName("contactless")
    val contactless: Boolean = false,

    @ColumnInfo(name = "length")
    @SerialName("length")
    var length: Double? = null,

    @ColumnInfo(name = "width")
    @SerialName("width")
    var width: Double? = null,

    @ColumnInfo(name = "height")
    @SerialName("height")
    var height: Double? = null,

    @ColumnInfo(name = "weight")
    @SerialName("weight")
    var weight: Double? = null,

    @ColumnInfo(name = "tambal_ban_report")
    @SerialName("tambal_ban_report")
    var tambalBanReport: TambalBanReport? = null,

    @ColumnInfo(name = "towing_report")
    @SerialName("towing_report")
    var towingReport: TowingReport? = null
)

fun Order.normalizedWorkflowRole(): String {
    val role = workflowRole.lowercase()
    val modelValue = model.lowercase()
    return when {
        role == "on_demand" || role == "ondemand" -> "on_demand"
        role == "regular" -> "regular"
        role == "pickup" || role == "pickup_only" -> "regular"
        role == "delivery" || role == "delivery_only" -> "regular"
        modelValue == "on_demand" || modelValue == "ondemand" -> "on_demand"
        modelValue == "p2p" -> "regular"
        else -> "regular"
    }
}

fun Order.cleanPayoutIdr(): Int {
    if (courierPayoutEstimateIdr > 0) return courierPayoutEstimateIdr
    val numericFee = fee.filter { it.isDigit() }.toIntOrNull() ?: 0
    if (numericFee > 0) return numericFee
    return maxOf(customerPriceIdr - platformCommissionIdr, 0)
}

fun Order.displayServiceName(): String {
    return serviceName?.takeIf { it.isNotBlank() }
        ?: serviceCode?.replace("_", " ")?.split(" ")?.joinToString(" ") { word ->
            word.replaceFirstChar { if (it.isLowerCase()) it.titlecase() else it.toString() }
        }
        ?: "TEMBUS On Demand"
}

fun Order.distanceKmValue(): Double {
    return distance
        .replace(",", ".")
        .split(" ")
        .firstOrNull()
        ?.filter { it.isDigit() || it == '.' }
        ?.toDoubleOrNull()
        ?: 0.0
}

fun Order.etaMinutesValue(): Int {
    if (serviceMaxEtaMinutes > 0) return serviceMaxEtaMinutes
    return 0
}

fun Int.toRupiahCompact(): String {
    return "Rp%,d".format(this).replace(',', '.')
}
