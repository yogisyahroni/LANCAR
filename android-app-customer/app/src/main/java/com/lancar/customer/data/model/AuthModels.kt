package com.lancar.customer.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class OtpRequest(
    @SerialName("phone")
    val phone: String
)

@Serializable
data class OtpV1Request(
    @SerialName("phone_number")
    val phoneNumber: String
)

@Serializable
data class LoginRequest(
    @SerialName("phone")
    val phone: String,

    @SerialName("otp_code")
    val otpCode: String
)

@Serializable
data class LoginV1Request(
    @SerialName("phone_number")
    val phoneNumber: String,

    @SerialName("code")
    val code: String
)

@Serializable
data class CustomerPasswordLoginStartRequest(
    @SerialName("email")
    val email: String,

    @SerialName("password")
    val password: String
)

@Serializable
data class CustomerPasswordRegisterStartRequest(
    @SerialName("full_name")
    val fullName: String,

    @SerialName("email")
    val email: String,

    @SerialName("phone_number")
    val phoneNumber: String,

    @SerialName("password")
    val password: String
)

@Serializable
data class AuthResponse(
    @SerialName("success")
    val success: Boolean = true,
    
    @SerialName("message")
    val message: String? = null,
    
    @SerialName("data")
    val data: AuthData? = null,

    @SerialName("is_new_user")
    val isNewUser: Boolean = false,

    @SerialName("access_token")
    val accessToken: String? = null,

    @SerialName("refresh_token")
    val refreshToken: String? = null,

    @SerialName("user")
    val user: AuthUser? = null
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

@Serializable
data class AuthUser(
    @SerialName("id")
    val id: String? = null,

    @SerialName("name")
    val name: String? = null,

    @SerialName("full_name")
    val fullName: String? = null,

    @SerialName("email")
    val email: String? = null,

    @SerialName("phone_number")
    val phoneNumber: String? = null
)
