package com.tembus.courier.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Login Request
 *
 * Payload for POST /api/v1/auth/courier/login
 */
@Serializable
data class LoginRequest(
    @SerialName("username")
    val username: String,

    @SerialName("password")
    val password: String,

    @SerialName("device_id")
    val deviceId: String,

    @SerialName("device_info")
    val deviceInfo: Map<String, String> = emptyMap()
)

@Serializable
data class CourierOtpVerifyRequest(
    @SerialName("username")
    val username: String,

    @SerialName("code")
    val code: String,

    @SerialName("device_id")
    val deviceId: String,

    @SerialName("device_info")
    val deviceInfo: Map<String, String> = emptyMap()
)

/**
 * Login Response Data
 *
 * Returned by auth-service on successful login.
 */
@Serializable
data class LoginData(
    @SerialName("token")
    val token: String? = null,

    @SerialName("courier_id")
    val courierId: String? = null,

    @SerialName("name")
    val name: String? = null,

    @SerialName("phone")
    val phone: String? = null,

    @SerialName("vehicle_type")
    val vehicleType: String? = null,

    @SerialName("profile_photo_url")
    val profilePhotoUrl: String? = null,

    @SerialName("requires_otp")
    val requiresOtp: Boolean = false,

    @SerialName("otp_reason")
    val otpReason: String? = null
)

/**
 * Courier Profile Data
 *
 * Returned by GET /api/v1/courier/profile
 */
@Serializable
data class CourierProfile(
    @SerialName("courier_id")
    val courierId: String,

    @SerialName("name")
    val name: String,

    @SerialName("phone")
    val phone: String? = null,

    @SerialName("vehicle_type")
    val vehicleType: String? = null,

    @SerialName("application_channel")
    val applicationChannel: String = "on_demand",

    @SerialName("status")
    val status: String = "offline",

    @SerialName("profile_photo_url")
    val profilePhotoUrl: String? = null,

    @SerialName("total_deliveries")
    val totalDeliveries: Int = 0,

    @SerialName("today_deliveries")
    val todayDeliveries: Int = 0,

    @SerialName("total_earnings_idr")
    val totalEarningsIdr: Int = 0,

    @SerialName("today_earnings_idr")
    val todayEarningsIdr: Int = 0
)

@Serializable
data class DutyStatusRequest(
    @SerialName("online")
    val online: Boolean,

    @SerialName("latitude")
    val latitude: Double? = null,

    @SerialName("longitude")
    val longitude: Double? = null,

    @SerialName("accuracy")
    val accuracy: Float? = null
)
