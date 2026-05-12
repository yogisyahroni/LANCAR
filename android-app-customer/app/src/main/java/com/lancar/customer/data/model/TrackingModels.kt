package com.lancar.customer.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class TrackingResponse(
    @SerialName("courier_id")
    val courierId: String,
    
    @SerialName("location")
    val location: TrackingLocation,
    
    @SerialName("eta")
    val eta: String? = null,
    
    @SerialName("route_polyline")
    val routePolyline: String? = null
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
