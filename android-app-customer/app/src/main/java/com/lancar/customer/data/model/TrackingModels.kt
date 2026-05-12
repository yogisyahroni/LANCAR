package com.lancar.customer.data.model

import com.google.gson.annotations.SerializedName

data class TrackingResponse(
    @SerializedName("courier_id")
    val courierId: String,
    
    @SerializedName("location")
    val location: TrackingLocation,
    
    @SerializedName("eta")
    val eta: String? = null,
    
    @SerializedName("route_polyline")
    val routePolyline: String? = null
)

data class TrackingLocation(
    @SerializedName("latitude")
    val latitude: Double,
    
    @SerializedName("longitude")
    val longitude: Double,
    
    @SerializedName("heading")
    val heading: Double = 0.0,
    
    @SerializedName("timestamp")
    val timestamp: String? = null
)
