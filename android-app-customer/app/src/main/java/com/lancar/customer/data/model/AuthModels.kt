package com.lancar.customer.data.model

import com.google.gson.annotations.SerializedName

/**
 * Request payload for POST /auth/customer/otp-request
 */
data class OtpRequest(
    @SerializedName("phone")
    val phone: String
)

/**
 * Request payload for POST /auth/customer/login
 */
data class LoginRequest(
    @SerializedName("phone")
    val phone: String,

    @SerializedName("otp_code")
    val otpCode: String
)

/**
 * Response payload for Login & OTP
 */
data class AuthResponse(
    @SerializedName("success")
    val success: Boolean,
    
    @SerializedName("message")
    val message: String?,
    
    @SerializedName("data")
    val data: AuthData?
)

data class AuthData(
    @SerializedName("token")
    val token: String,
    
    @SerializedName("customer_id")
    val customerId: String,
    
    @SerializedName("name")
    val name: String? = null
)
