package com.lancar.customer.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class CreateOrderRequest(
    @SerialName("pickup_address") val pickupAddress: String,
    @SerialName("pickup_lat") val pickupLat: Double,
    @SerialName("pickup_lng") val pickupLng: Double,
    @SerialName("drop_address") val dropAddress: String,
    @SerialName("drop_lat") val dropLat: Double,
    @SerialName("drop_lng") val dropLng: Double,
    @SerialName("item_details") val itemDetails: String,
    @SerialName("estimated_price") val estimatedPrice: Long
)

@Serializable
data class UpdateProfileRequest(
    @SerialName("name") val name: String,
    @SerialName("phone_number") val phoneNumber: String
)

@Serializable
data class ProfileResponse(
    @SerialName("id") val id: String,
    @SerialName("name") val name: String,
    @SerialName("phone_number") val phoneNumber: String,
    @SerialName("wallet_balance") val walletBalance: Long,
    @SerialName("profile_image_url") val profileImageUrl: String? = null
)

@Serializable
data class PaymentRequest(
    @SerialName("payment_method") val paymentMethod: String
)

@Serializable
data class PaymentResponse(
    @SerialName("payment_url") val paymentUrl: String? = null,
    @SerialName("status") val status: String
)
