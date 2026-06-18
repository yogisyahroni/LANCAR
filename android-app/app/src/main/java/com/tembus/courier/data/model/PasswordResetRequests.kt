package com.tembus.courier.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class ForgotPasswordRequest(
    val email: String
)

@Serializable
data class ConfirmPasswordResetRequest(
    val email: String,
    val code: String,
    @SerialName("new_password")
    val newPassword: String
)
