package com.tembus.customer.data.model

import kotlinx.serialization.Serializable

@Serializable
data class RegisterTokenRequest(
    val device_token: String,
    val platform: String = "android"
)

@Serializable
data class NotificationData(
    val id: String,
    val title: String,
    val body: String,
    val type: String,
    val order_id: String? = null,
    val metadata: String? = null,
    val deep_link: String? = null,
    val created_at: String
)
