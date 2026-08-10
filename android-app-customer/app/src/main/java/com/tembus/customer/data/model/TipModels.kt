package com.tembus.customer.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * FB-077: Tips driver — berlaku untuk SEMUA layanan
 * (parcel, tambal ban, towing, food).
 */

@Serializable
data class CreateTipRequest(
    @SerialName("amount_idr")
    val amountIdr: Long
)

@Serializable
data class DriverTip(
    @SerialName("id")
    val id: String,
    @SerialName("order_id")
    val orderId: String,
    @SerialName("customer_id")
    val customerId: String,
    @SerialName("courier_id")
    val courierId: String,
    @SerialName("amount_idr")
    val amountIdr: Long,
    @SerialName("service_sub_type")
    val serviceSubType: String? = null,
    @SerialName("status")
    val status: String? = null,
    @SerialName("created_at")
    val createdAt: String? = null
)

@Serializable
data class TipCreateResponse(
    @SerialName("tip")
    val tip: DriverTip? = null,
    @SerialName("amount_idr")
    val amountIdr: Long? = null,
    @SerialName("message")
    val message: String? = null
)

@Serializable
data class TipStatusResponse(
    @SerialName("tip")
    val tip: DriverTip? = null,
    @SerialName("tipped")
    val tipped: Boolean = false
)
