package com.tembus.courier.data.model

import kotlinx.serialization.Serializable

@Serializable
data class SosTamperRequest(
    val incident_id: String
)
