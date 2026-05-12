package com.lancar.customer.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class OtpRequest(
    @SerialName("phone")
    val phone: String
)

@Serializable
data class LoginRequest(
    @SerialName("phone")
    val phone: String,

    @SerialName("otp_code")
    val otpCode: String
)

@Serializable
data class AuthResponse(
    @SerialName("success")
    val success: Boolean,
    
    @SerialName("message")
    val message: String?,
    
    @SerialName("data")
    val data: AuthData?
)

@Serializable
data class AuthData(
    @SerialName("token")
    val token: String,
    
    @SerialName("customer_id")
    val customerId: String,
    
    @SerialName("name")
    val name: String? = null
)
