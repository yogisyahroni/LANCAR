package com.tembus.customer.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

@Serializable
data class OrderTrackingDetailResponse(
    @SerialName("success")
    val success: Boolean,
    @SerialName("data")
    val data: OrderTrackingDetail? = null,
    @SerialName("message")
    val message: String? = null
)

@Serializable
data class OrderTrackingDetail(
    @SerialName("order")
    val order: TrackingOrder,
    @SerialName("events")
    val events: List<TrackingEvent> = emptyList(),
    @SerialName("packages")
    val packages: List<TrackingPackage> = emptyList(),
    @SerialName("proofs")
    val proofs: List<TrackingProof> = emptyList(),
    @SerialName("tracking")
    val tracking: CustomerTrackingSnapshot? = null
)

@Serializable
data class TrackingOrder(
    @SerialName("id")
    val id: String,
    @SerialName("order_number")
    val orderNumber: String? = null,
    @SerialName("pickup_address")
    val pickupAddress: String? = null,
    @SerialName("dropoff_address")
    val dropoffAddress: String? = null,
    @SerialName("recipient_name")
    val recipientName: String? = null,
    @SerialName("model")
    val model: String? = null,
    @SerialName("status")
    val status: String = "pending",
    @SerialName("status_label")
    val statusLabel: String? = null,
    @SerialName("distance_km")
    val distanceKm: Double? = null,
    @SerialName("total_price_idr")
    val totalPriceIdr: Long? = null,
    @SerialName("invoice")
    val invoice: TrackingInvoice? = null,
    @SerialName("courier_name")
    val courierName: String? = null,
    @SerialName("courier_vehicle")
    val courierVehicle: String? = null,
    @SerialName("courier_plate")
    val courierPlate: String? = null,
    @SerialName("courier_rating")
    val courierRating: Double? = null,
    @SerialName("courier_phone")
    val courierPhone: String? = null,
    @SerialName("courier_photo_url")
    val courierPhotoUrl: String? = null,
    @SerialName("merchant_id")
    val merchantId: String? = null,
    @SerialName("merchant_name")
    val merchantName: String? = null,
    @SerialName("service_sub_type")
    val serviceSubType: String? = null,
    @SerialName("route_snapshot")
    val routeSnapshot: RouteSnapshot? = null,
    @SerialName("route_provider")
    val routeProvider: String? = null,
    @SerialName("route_profile")
    val routeProfile: String? = null,
    @SerialName("route_polyline")
    val routePolyline: String? = null,
    @SerialName("route_distance_meters")
    val routeDistanceMeters: Int? = null,
    @SerialName("route_duration_seconds")
    val routeDurationSeconds: Int? = null,
    @SerialName("eta_minutes")
    val etaMinutes: Int? = null,
    @SerialName("created_at")
    val createdAt: String? = null,
    @SerialName("updated_at")
    val updatedAt: String? = null,
    @SerialName("order_notes")
    val orderNotes: String? = null,
    @SerialName("food_items")
    val foodItems: List<FoodOrderItem> = emptyList(),
    @SerialName("tambal_ban_report")
    val tambalBanReport: TambalBanReport? = null,
    @SerialName("towing_report")
    val towingReport: TowingReport? = null
)

@Serializable
data class TrackingInvoice(
    @SerialName("amount_idr")
    val amountIdr: Long = 0,
    @SerialName("currency")
    val currency: String = "IDR",
    @SerialName("payment_status")
    val paymentStatus: String = "pending",
    @SerialName("payment_method")
    val paymentMethod: String? = null,
    @SerialName("provider")
    val provider: String? = null,
    @SerialName("paid_at")
    val paidAt: String? = null,
    @SerialName("payment_reference")
    val paymentReference: String? = null
)

@Serializable
data class CustomerTrackingSnapshot(
    @SerialName("order_id")
    val orderId: String? = null,
    @SerialName("order_number")
    val orderNumber: String? = null,
    @SerialName("stage")
    val stage: String? = null,
    @SerialName("stage_label")
    val stageLabel: String? = null,
    @SerialName("status")
    val status: String? = null,
    @SerialName("location")
    val location: TrackingLocation? = null,
    @SerialName("target")
    val target: JsonObject? = null,
    @SerialName("eta")
    val eta: String? = null,
    @SerialName("eta_minutes")
    val etaMinutes: Int? = null,
    @SerialName("route_polyline")
    val routePolyline: String? = null,
    @SerialName("route_provider")
    val routeProvider: String? = null,
    @SerialName("order_route_snapshot")
    val orderRouteSnapshot: RouteSnapshot? = null,
    @SerialName("order_route_provider")
    val orderRouteProvider: String? = null,
    @SerialName("order_route_profile")
    val orderRouteProfile: String? = null,
    @SerialName("order_route_polyline")
    val orderRoutePolyline: String? = null,
    @SerialName("order_route_distance_meters")
    val orderRouteDistanceMeters: Int? = null,
    @SerialName("order_route_duration_seconds")
    val orderRouteDurationSeconds: Int? = null,
    @SerialName("order_route_snapshot_hash")
    val orderRouteSnapshotHash: String? = null,
    @SerialName("order_route_version")
    val orderRouteVersion: String? = null,
    @SerialName("proof_summary")
    val proofSummary: JsonObject? = null,
    @SerialName("privacy_scope")
    val privacyScope: JsonObject? = null,
    @SerialName("quality")
    val quality: JsonObject? = null
)

@Serializable
data class TrackingPackage(
    @SerialName("package_id")
    val packageId: String? = null,
    @SerialName("package_index")
    val packageIndex: Int? = null,
    @SerialName("package_code")
    val packageCode: String? = null,
    @SerialName("description")
    val description: String? = null,
    @SerialName("size_tier")
    val sizeTier: String? = null,
    @SerialName("weight_kg")
    val weightKg: Double? = null,
    @SerialName("status")
    val status: String? = null,
    @SerialName("pickup_scan_verified_at")
    val pickupScanVerifiedAt: String? = null,
    @SerialName("pickup_photo_verified_at")
    val pickupPhotoVerifiedAt: String? = null,
    @SerialName("delivery_pod_verified_at")
    val deliveryPodVerifiedAt: String? = null
)

@Serializable
data class TrackingEvent(
    @SerialName("id")
    val id: String,
    @SerialName("event_type")
    val eventType: String,
    @SerialName("description")
    val description: String? = null,
    @SerialName("metadata")
    val metadata: JsonObject? = null,
    @SerialName("created_at")
    val createdAt: String? = null
)

@Serializable
data class TrackingProof(
    @SerialName("id")
    val id: String,
    @SerialName("scan_type")
    val scanType: String? = null,
    @SerialName("proof_label")
    val proofLabel: String? = null,
    @SerialName("proof_category")
    val proofCategory: String? = null,
    @SerialName("photo_url")
    val photoUrl: String? = null,
    @SerialName("image_urls")
    val imageUrls: List<String>? = null,
    @SerialName("override_reason")
    val overrideReason: String? = null,
    @SerialName("reason_code")
    val reasonCode: String? = null,
    @SerialName("reason_note")
    val reasonNote: String? = null,
    @SerialName("latitude")
    val latitude: Double? = null,
    @SerialName("longitude")
    val longitude: Double? = null,
    @SerialName("recorded_at")
    val recordedAt: String? = null
)
