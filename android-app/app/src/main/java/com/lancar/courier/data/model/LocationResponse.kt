package com.lancar.courier.data.model

/**
 * Location Sync Response
 *
 * Response from backend confirming location sync.
 */
data class LocationResponse(
    val success: Boolean = true,
    val message: String? = null,
    val syncedCount: Int = 0
)