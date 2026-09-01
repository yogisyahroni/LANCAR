package com.tembus.customer.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class TrackingResponse(
    @SerialName("courier_id")
    val courierId: String,

    @SerialName("stage")
    val stage: String? = null,

    @SerialName("status")
    val status: String? = null,
    
    @SerialName("location")
    val location: TrackingLocation,
    
    @SerialName("eta")
    val eta: String? = null,
    
    @SerialName("route_polyline")
    val routePolyline: String? = null,

    @SerialName("eta_minutes")
    val etaMinutes: Int? = null,

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
    val orderRouteVersion: String? = null
)

@Serializable
data class TrackingLocation(
    @SerialName("latitude")
    val latitude: Double,
    
    @SerialName("longitude")
    val longitude: Double,
    
    @SerialName("heading")
    val heading: Double = 0.0,
    
    @SerialName("timestamp")
    val timestamp: String? = null
)
