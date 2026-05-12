package com.lancar.customer.data.model

import kotlinx.serialization.Serializable

@Serializable
data class LocationRequest(
    val courierId: String,
    val locations: List<LocationData>,
    val deviceId: String
)
