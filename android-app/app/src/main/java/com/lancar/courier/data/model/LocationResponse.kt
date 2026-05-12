package com.lancar.courier.data.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.SerialName

/**
 * Location Sync Response
 *
 * Response from backend confirming location sync.
 */
@Serializable
data class LocationResponse(
    val success: Boolean = true,
    val message: String? = null,
    val syncedCount: Int = 0
)