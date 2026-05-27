package com.tembus.courier.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Location Sync Request
 *
 * Sent to backend to sync multiple location points for a courier.
 */
@Serializable
data class LocationRequest(
    @SerialName("courier_id")
    val courierId: String,

    @SerialName("locations")
    val locations: List<LocationData>,

    @SerialName("device_id")
    val deviceId: String
)