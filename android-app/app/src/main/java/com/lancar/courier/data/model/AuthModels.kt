package com.lancar.courier.data.model

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
    val password: String
)

/**
 * Login Response Data
 *
 * Returned by auth-service on successful login.
 */
@Serializable
data class LoginData(
    @SerialName("token")
    val token: String,

    @SerialName("courier_id")
    val courierId: String,

    @SerialName("name")
    val name: String,

    @SerialName("phone")
    val phone: String? = null,

    @SerialName("vehicle_type")
    val vehicleType: String? = null,

    @SerialName("profile_photo_url")
    val profilePhotoUrl: String? = null
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
