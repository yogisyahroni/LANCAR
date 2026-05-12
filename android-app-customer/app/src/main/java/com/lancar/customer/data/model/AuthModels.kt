package com.lancar.customer.data.model

import com.google.gson.annotations.SerializedName

/**
 * Login Request
 *
 * Payload for POST /api/v1/auth/courier/login
 */
data class LoginRequest(
    @SerializedName("username")
    val username: String,

    @SerializedName("password")
    val password: String
)

/**
 * Login Response Data
 *
 * Returned by auth-service on successful login.
 */
data class LoginData(
    @SerializedName("token")
    val token: String,

    @SerializedName("courier_id")
    val courierId: String,

    @SerializedName("name")
    val name: String,

    @SerializedName("phone")
    val phone: String? = null,

    @SerializedName("vehicle_type")
    val vehicleType: String? = null,

    @SerializedName("profile_photo_url")
    val profilePhotoUrl: String? = null
)

/**
 * Courier Profile Data
 *
 * Returned by GET /api/v1/courier/profile
 */
data class CourierProfile(
    @SerializedName("courier_id")
    val courierId: String,

    @SerializedName("name")
    val name: String,

    @SerializedName("phone")
    val phone: String? = null,

    @SerializedName("vehicle_type")
    val vehicleType: String? = null,

    @SerializedName("status")
    val status: String = "offline",

    @SerializedName("profile_photo_url")
    val profilePhotoUrl: String? = null,

    @SerializedName("total_deliveries")
    val totalDeliveries: Int = 0,

    @SerializedName("today_deliveries")
    val todayDeliveries: Int = 0
)
