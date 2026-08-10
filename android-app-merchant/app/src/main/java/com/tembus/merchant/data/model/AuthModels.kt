package com.tembus.merchant.data.model

import com.google.gson.annotations.SerializedName

/** Request login email/password — endpoint /api/v1/auth/customer/login/start (generic untuk semua role). */
data class LoginRequest(
    @SerializedName("email") val email: String,
    @SerializedName("password") val password: String,
    @SerializedName("device_id") val deviceId: String = "",
    @SerializedName("device_info") val deviceInfo: Map<String, String> = emptyMap()
)

data class AuthResponse(
    @SerializedName("success") val success: Boolean = true,
    @SerializedName("message") val message: String? = null,
    @SerializedName("data") val data: AuthData? = null,
    @SerializedName("access_token") val accessToken: String? = null,
    @SerializedName("refresh_token") val refreshToken: String? = null,
    @SerializedName("user") val authUser: AuthUser? = null
)

data class AuthData(
    @SerializedName("token") val token: String,
    @SerializedName("customer_id") val customerId: String,
    @SerializedName("name") val name: String? = null
)

data class AuthUser(
    @SerializedName("id") val id: String? = null,
    @SerializedName("name") val name: String? = null,
    @SerializedName("full_name") val fullName: String? = null,
    @SerializedName("email") val email: String? = null
)

/** Wrapper error umum {error: message} dari merchant-service. */
data class ApiError(
    @SerializedName("error") val error: String? = null,
    @SerializedName("message") val message: String? = null
)

/** Request refresh token — endpoint /api/v1/auth/refresh (ADR-004). */
data class RefreshTokenRequest(
    @SerializedName("refresh_token") val refreshToken: String,
    @SerializedName("device_id") val deviceId: String
)
