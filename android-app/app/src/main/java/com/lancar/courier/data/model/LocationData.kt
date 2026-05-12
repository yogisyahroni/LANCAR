package com.lancar.courier.data.model

import com.google.gson.annotations.SerializedName
import java.util.Date

/**
 * Location Data Transfer Object
 *
 * Represents a single GPS location reading to be sent to the backend.
 */
data class LocationData(
    @SerializedName("latitude")
    val latitude: Double,

    @SerializedName("longitude")
    val longitude: Double,

    @SerializedName("accuracy")
    val accuracy: Float = 0f,

    @SerializedName("speed")
    val speed: Float = 0f,

    @SerializedName("heading")
    val bearing: Float = 0f,

    @SerializedName("altitude")
    val altitude: Double = 0.0,

    @SerializedName("timestamp")
    val timestamp: Date = Date(),

    @SerializedName("battery_level")
    val batteryLevel: Int = 100,

    @SerializedName("network_type")
    val networkType: String = "UNKNOWN",

    @SerializedName("order_id")
    val orderId: String? = null
)