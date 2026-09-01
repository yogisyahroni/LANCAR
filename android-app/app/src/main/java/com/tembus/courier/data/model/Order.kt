package com.tembus.courier.data.model

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Ignore
import androidx.room.Index
import androidx.room.PrimaryKey
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// FB-105: rincian item pesanan food (snapshot food_order_items dari
// backend courier order detail). Driver butuh tahu isi pesanan yang
// dijemput/diantar — tidak bisa hanya andalkan struk fisik.
@Serializable
data class CourierOrderFoodItem(
    @SerialName("name")
    val name: String = "",
    @SerialName("quantity")
    val quantity: Int = 1,
    @SerialName("notes")
    val notes: String? = null,
    @SerialName("photo_url")
    val photo: String? = null,
    @SerialName("price")
    val price: Int = 0,
    // FB-108: pilihan varian yang dipilih customer (mis. "Level Pedas: Extra
    // Pedas") — driver harus tahu persis apa yang diserah terima merchant.
    @SerialName("variants")
    val variants: List<CourierOrderItemVariantSnapshot> = emptyList(),
)

// FB-108: snapshot satu pilihan varian untuk driver.
@Serializable
data class CourierOrderItemVariantSnapshot(
    @SerialName("variant_name")
    val variantName: String = "",
    @SerialName("option_name")
    val optionName: String = "",
)

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

@Serializable
data class CourierProofRequirements(
    @SerialName("face_verification_required")
    val faceVerificationRequired: Boolean = true,
    @SerialName("geofence_radius_m")
    val geofenceRadiusM: Int = 10,
    @SerialName("min_accuracy_m")
    val minAccuracyM: Int = 50,
    @SerialName("failed_delivery_policy")
    val failedDeliveryPolicy: String = "must_deliver",
    @SerialName("pod_label")
    val podLabel: String = "POD",
    @SerialName("required_steps")
    val requiredSteps: List<String> = emptyList()
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
        Index(value = ["needsPodSync"]),
        Index(value = ["sync_conflict"])
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

    /** Resi publik (TMBSxxxxxx) — backend sudah generate; fallback UUID pendek di UI */
    @ColumnInfo(name = "order_number")
    @SerialName("order_number")
    val orderNumber: String? = null,

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
    @SerialName("pickup_lat")
    val pickupLatitude: Double? = null,

    @ColumnInfo(name = "pickup_longitude")
    @SerialName("pickup_lng")
    val pickupLongitude: Double? = null,

    @ColumnInfo(name = "pickup_time")
    @SerialName("pickup_time")
    val pickupTime: String = "",

    @ColumnInfo(name = "drop_address")
    @SerialName("drop_address")
    val dropAddress: String = "",

    @ColumnInfo(name = "drop_latitude")
    @SerialName("dropoff_lat")
    val dropLatitude: Double? = null,

    @ColumnInfo(name = "drop_longitude")
    @SerialName("dropoff_lng")
    val dropLongitude: Double? = null,

    @ColumnInfo(name = "distance")
    @SerialName("distance")
    val distance: String = "",

    @ColumnInfo(name = "fee")
    @SerialName("fee")
    val fee: String = "",

    // FB-077: tip dari customer (Rp). 0 = belum di-tip.
    @ColumnInfo(name = "tip_amount_idr", defaultValue = "0")
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

    @ColumnInfo(name = "pricing_breakdown")
    @SerialName("pricing_breakdown")
    val pricingBreakdown: PricingBreakdown? = null,

    @ColumnInfo(name = "proof_requirements")
    @SerialName("proof_requirements")
    val proofRequirements: CourierProofRequirements? = null,

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

    @ColumnInfo(name = "route_snapshot")
    @SerialName("route_snapshot")
    val routeSnapshot: CourierRouteSnapshot? = null,

    @ColumnInfo(name = "route_provider")
    @SerialName("route_provider")
    val routeProvider: String? = null,

    @ColumnInfo(name = "route_profile")
    @SerialName("route_profile")
    val routeProfile: String? = null,

    @ColumnInfo(name = "route_polyline")
    @SerialName("route_polyline")
    val routePolyline: String? = null,

    @ColumnInfo(name = "route_distance_meters", defaultValue = "0")
    @SerialName("route_distance_meters")
    val routeDistanceMeters: Int = 0,

    @ColumnInfo(name = "route_duration_seconds", defaultValue = "0")
    @SerialName("route_duration_seconds")
    val routeDurationSeconds: Int = 0,

    @ColumnInfo(name = "eta_minutes", defaultValue = "0")
    @SerialName("eta_minutes")
    val etaMinutes: Int = 0,

    @ColumnInfo(name = "service_max_eta_minutes")
    @SerialName("service_max_eta_minutes")
    val serviceMaxEtaMinutes: Int = 0,

    @ColumnInfo(name = "package_count")
    @SerialName("package_count")
    val packageCount: Int = 1,

    @ColumnInfo(name = "packages", defaultValue = "[]")
    @SerialName("packages")
    val packages: List<CourierOrderPackage> = emptyList(),

    @ColumnInfo(name = "service_max_packages_per_order", defaultValue = "1")
    @SerialName("service_max_packages_per_order")
    val serviceMaxPackagesPerOrder: Int = 1,

    @ColumnInfo(name = "service_max_active_orders_on_demand", defaultValue = "1")
    @SerialName("service_max_active_orders_on_demand")
    val serviceMaxActiveOrdersOnDemand: Int = 1,

    @ColumnInfo(name = "service_face_verification_required", defaultValue = "1")
    @SerialName("service_face_verification_required")
    val serviceFaceVerificationRequired: Boolean = true,

    @ColumnInfo(name = "service_proof_geofence_radius_m", defaultValue = "10")
    @SerialName("service_proof_geofence_radius_m")
    val serviceProofGeofenceRadiusM: Int = 10,

    @ColumnInfo(name = "service_proof_min_accuracy_m", defaultValue = "50")
    @SerialName("service_proof_min_accuracy_m")
    val serviceProofMinAccuracyM: Int = 50,

    @ColumnInfo(name = "service_failed_delivery_policy", defaultValue = "must_deliver")
    @SerialName("service_failed_delivery_policy")
    val serviceFailedDeliveryPolicy: String = "must_deliver",

    @ColumnInfo(name = "item_description")
    @SerialName("item_description")
    val itemDescription: String? = null,

    // FB-105: rincian item food (snapshot food_order_items dari backend).
    // Kosong [] untuk order parcel biasa. Dipakai OrderDetailScreen.
    @ColumnInfo(name = "food_items", defaultValue = "[]")
    @SerialName("food_items")
    val foodItems: List<CourierOrderFoodItem> = emptyList(),

    @ColumnInfo(name = "item_image_url")
    @SerialName("item_image_url")
    val itemImageUrl: String? = null,

    @ColumnInfo(name = "model", defaultValue = "P2P")
    @SerialName("model")
    val model: String = "P2P",

    @ColumnInfo(name = "leg_number", defaultValue = "1")
    @SerialName("leg_number")
    val legNumber: Int = 1,

    @ColumnInfo(name = "workflow_role", defaultValue = "on_demand")
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

    @ColumnInfo(name = "customer_photo_url")
    @SerialName("customer_photo_url")
    val customerPhotoUrl: String = "",

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
     * The backend rejected a local mutation because its state changed first.
     * This is intentionally persisted so the conflict remains visible offline.
     */
    @ColumnInfo(name = "sync_conflict", defaultValue = "0")
    @SerialName("sync_conflict")
    var syncConflict: Boolean = false,

    @ColumnInfo(name = "sync_conflict_message")
    @SerialName("sync_conflict_message")
    var syncConflictMessage: String? = null,

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
    @ColumnInfo(name = "contactless", defaultValue = "0")
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

/**
 * Estimasi pendapatan bersih kurir (standar Gojek/Grab — tampil di halaman
 * offer & navigasi). Untuk home service (tambal_ban/towing) pendapatan =
 * jasa + travel − komisi platform (dari travel fee saja), sesuai
 * settlement_snapshot.pricing_breakdown yang dikirim backend.
 * Fallback: cleanPayoutIdr() (payout lump-sum) utk non-maintenance.
 */
fun Order.estimatedNetEarningsIdr(): Int {
    val pb = pricingBreakdown
    if (isMaintenanceService() && pb != null && pb.serviceFeeIdr > 0 && pb.travelFeeIdr >= 0) {
        // backend mengirim pct di settlement_snapshot, TIDAK di pricing_breakdown → fallback 20 (default bisnis, sama dgn FlowViewModel)
        val commissionPct = pb.platformCommissionPct.takeIf { it > 0 } ?: 20.0
        val commission = Math.ceil(pb.travelFeeIdr * (commissionPct / 100.0)).toInt()
        return pb.serviceFeeIdr + pb.travelFeeIdr - commission
    }
    return cleanPayoutIdr()
}

fun Order.displayServiceName(): String {
    return serviceName?.takeIf { it.isNotBlank() }
        ?: serviceCode?.replace("_", " ")?.split(" ")?.joinToString(" ") { word ->
            word.replaceFirstChar { if (it.isLowerCase()) it.titlecase() else it.toString() }
        }
        ?: "TEMBUS On Demand"
}

fun Order.isMaintenanceService(): Boolean {
    val code = serviceCategory.orEmpty().lowercase()
    val sc = serviceCode.orEmpty().lowercase()
    return code in setOf("tambal_ban", "towing") ||
        sc.startsWith("tambal_ban") || sc.startsWith("towing")
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
    routeSnapshot?.etaMinutes?.takeIf { it > 0 }?.let { return it }
    etaMinutes.takeIf { it > 0 }?.let { return it }
    if (serviceMaxEtaMinutes > 0) return serviceMaxEtaMinutes
    return 0
}

fun Int.toRupiahCompact(): String {
    return "Rp%,d".format(this).replace(',', '.')
}
