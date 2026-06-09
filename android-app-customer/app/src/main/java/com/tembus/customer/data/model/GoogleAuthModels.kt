package com.tembus.customer.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// ─────────────────────────────────────────────
// Google Auth — Request Models
// ─────────────────────────────────────────────

@Serializable
data class GoogleAuthStartRequest(
    @SerialName("platform")
    val platform: String = "android_customer",

    @SerialName("device_id")
    val deviceId: String,
)

@Serializable
data class GoogleAuthCompleteRequest(
    @SerialName("platform")
    val platform: String = "android_customer",

    @SerialName("id_token")
    val idToken: String,

    @SerialName("nonce")
    val nonce: String? = null,

    @SerialName("transaction_id")
    val transactionId: String? = null,

    @SerialName("device_id")
    val deviceId: String,

    @SerialName("device_info")
    val deviceInfo: Map<String, String> = emptyMap()
)

// ─────────────────────────────────────────────
// Google Auth — Response Models
// ─────────────────────────────────────────────

@Serializable
data class GoogleAuthStartResponse(
    @SerialName("transaction_id")
    val transactionId: String,

    @SerialName("state")
    val state: String,

    @SerialName("nonce")
    val nonce: String,

    @SerialName("authorization_url")
    val authorizationUrl: String
)

@Serializable
data class GoogleAuthCompleteResponse(
    @SerialName("status")
    val status: String,  // "authenticated" | "requires_phone" | "requires_step_up_otp" | "blocked"

    // populated when status == "authenticated"
    @SerialName("access_token")
    val accessToken: String? = null,

    @SerialName("refresh_token")
    val refreshToken: String? = null,

    @SerialName("expires_in")
    val expiresIn: Int? = null,

    @SerialName("user")
    val user: AuthUser? = null,

    // populated when status == "requires_step_up_otp" or "requires_phone"
    @SerialName("transaction_id")
    val transactionId: String? = null,

    @SerialName("masked_recipient")
    val maskedRecipient: String? = null,

    @SerialName("preferred_channel")
    val preferredChannel: String? = null,

    @SerialName("expires_in_seconds")
    val expiresInSeconds: Int? = null,

    // populated when status == "requires_phone" (new Google user)
    @SerialName("email")
    val email: String? = null,

    @SerialName("full_name")
    val fullName: String? = null
)

// ─────────────────────────────────────────────
// Customer OTP — Request Models
// ─────────────────────────────────────────────

@Serializable
data class CustomerOtpSendRequest(
    @SerialName("phone_number")
    val phoneNumber: String,

    @SerialName("channel")
    val channel: String = "whatsapp",

    @SerialName("transaction_id")
    val transactionId: String? = null,

    @SerialName("device_id")
    val deviceId: String
)

@Serializable
data class CustomerOtpVerifyRequest(
    @SerialName("challenge_id")
    val challengeId: String,

    @SerialName("code")
    val code: String,

    @SerialName("phone_number")
    val phoneNumber: String,

    @SerialName("device_id")
    val deviceId: String,

    @SerialName("device_info")
    val deviceInfo: Map<String, String> = emptyMap()
)

// ─────────────────────────────────────────────
// Customer OTP — Response Models
// ─────────────────────────────────────────────

@Serializable
data class CustomerOtpSendResponse(
    @SerialName("challenge_id")
    val challengeId: String,

    @SerialName("masked_recipient")
    val maskedRecipient: String,

    @SerialName("channel")
    val channel: String,

    @SerialName("expires_in_seconds")
    val expiresInSeconds: Int,

    @SerialName("resend_cooldown_seconds")
    val resendCooldownSeconds: Int
)

@Serializable
data class CustomerOtpVerifyResponse(
    @SerialName("status")
    val status: String, // "authenticated" | "step_up_complete" | "phone_verified"

    @SerialName("access_token")
    val accessToken: String? = null,

    @SerialName("refresh_token")
    val refreshToken: String? = null,

    @SerialName("expires_in")
    val expiresIn: Int? = null,

    @SerialName("user")
    val user: AuthUser? = null
)
