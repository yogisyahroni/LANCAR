package com.lancar.courier.data.model

/**
 * Location Sync Request
 *
 * Sent to backend to sync multiple location points for a courier.
 */
data class LocationRequest(
    val courierId: String,
    val locations: List<LocationData>,
    val deviceId: String
)