package com.lancar.courier.data.model

/**
 * Location Data Transfer Object
 *
 * Represents a single GPS location reading to be sent to the backend.
 */
data class LocationData(
    val latitude: Double,
    val longitude: Double,
    val accuracy: Float = 0f,
    val speed: Float = 0f,
    val bearing: Float = 0f,
    val altitude: Double = 0.0,
    val timestamp: Long = System.currentTimeMillis(),
    val batteryLevel: Int = 100,
    val networkType: String = "UNKNOWN"
)