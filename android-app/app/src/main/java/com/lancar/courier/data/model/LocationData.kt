package com.lancar.courier.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import java.util.Date

/**
 * Location Data Transfer Object
 *
 * Represents a single GPS location reading to be sent to the backend.
 */
@Serializable
data class LocationData(
    @SerialName("latitude")
    val latitude: Double,

    @SerialName("longitude")
    val longitude: Double,

    @SerialName("accuracy")
    val accuracy: Float = 0f,

    @SerialName("speed")
    val speed: Float = 0f,

    @SerialName("heading")
    val bearing: Float = 0f,

    @SerialName("altitude")
    val altitude: Double = 0.0,

    @SerialName("timestamp")
    val timestamp: Long = System.currentTimeMillis(),

    @SerialName("battery_level")
    val batteryLevel: Int = 100,

    @SerialName("network_type")
    val networkType: String = "UNKNOWN",

    @SerialName("is_mock")
    val isMock: Boolean = false,

    @SerialName("is_rooted")
    val isRooted: Boolean = false,

    @SerialName("order_id")
    val orderId: String? = null
)