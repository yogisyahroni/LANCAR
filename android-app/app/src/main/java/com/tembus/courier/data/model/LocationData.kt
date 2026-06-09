package com.tembus.courier.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

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
    val timestamp: String,

    @SerialName("battery_level")
    val batteryLevel: Int = 100,

    @SerialName("network_type")
    val networkType: String = "UNKNOWN",

    @SerialName("is_mock")
    val isMock: Boolean = false,

    @SerialName("is_rooted")
    val isRooted: Boolean = false,

    @SerialName("order_id")
    val orderId: String? = null,

    @SerialName("client_location_id")
    val clientLocationId: String? = null,

    // ── Anti-Fake GPS Telemetry ─────────────────────────────────
    @SerialName("risk_score")
    val riskScore: Float = 0f,

    @SerialName("risk_level")
    val riskLevel: String = "VALID",

    @SerialName("mock_setting_enabled")
    val mockSettingEnabled: Boolean = false,

    @SerialName("developer_options")
    val developerOptions: Boolean = false,

    @SerialName("usb_debugging")
    val usbDebugging: Boolean = false,

    @SerialName("fake_gps_apps")
    val fakeGpsApps: List<String> = emptyList(),

    @SerialName("accelerometer_ok")
    val accelerometerOk: Boolean = true,

    @SerialName("gyroscope_ok")
    val gyroscopeOk: Boolean = true,

    @SerialName("barometer_ok")
    val barometerOk: Boolean = true,

    @SerialName("step_counter_ok")
    val stepCounterOk: Boolean = true,

    @SerialName("sensor_available")
    val sensorAvailable: Boolean = true
)
