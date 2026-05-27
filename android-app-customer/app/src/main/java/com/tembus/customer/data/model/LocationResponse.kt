package com.tembus.customer.data.model

import kotlinx.serialization.Serializable

@Serializable
data class LocationResponse(
    val success: Boolean = true,
    val message: String? = null,
    val syncedCount: Int = 0
)
