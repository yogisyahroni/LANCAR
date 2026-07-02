package com.tembus.courier.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class SosTriggerRequest(
    @SerialName("latitude") val latitude: Double,
    @SerialName("longitude") val longitude: Double
)

@Serializable
data class SosTriggerResponse(
    @SerialName("incident_id") val incidentId: String,
    @SerialName("status") val status: String
)
