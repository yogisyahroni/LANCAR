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
    @SerialName("proofs")
    val proofs: List<TrackingProof> = emptyList()
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
    @SerialName("distance_km")
    val distanceKm: Double? = null,
    @SerialName("total_price_idr")
    val totalPriceIdr: Long? = null,
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
    @SerialName("created_at")
    val createdAt: String? = null,
    @SerialName("updated_at")
    val updatedAt: String? = null
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
