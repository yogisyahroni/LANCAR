package com.tembus.courier.data.model

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
    val syncedCount: Int = 0,
    val acceptedCount: Int = 0,
    val rejectedCount: Int = 0,
    val duplicateCount: Int = 0
)
