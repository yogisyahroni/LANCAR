package com.lancar.courier.data.model

import com.google.gson.annotations.SerializedName

/**
 * Location Sync Request
 *
 * Sent to backend to sync multiple location points for a courier.
 */
data class LocationRequest(
    @SerializedName("courier_id")
    val courierId: String,

    @SerializedName("locations")
    val locations: List<LocationData>,

    @SerializedName("device_id")
    val deviceId: String
)