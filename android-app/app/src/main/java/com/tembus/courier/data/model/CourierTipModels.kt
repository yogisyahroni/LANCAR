package com.tembus.courier.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * FB-077: Tips driver — rekap tip yang diterima kurir dari customer.
 */

@Serializable
data class CourierTipsSummary(
    @SerialName("total_tips")
    val totalTips: Int = 0,
    @SerialName("total_amount_idr")
    val totalAmountIdr: Long = 0,
    @SerialName("today_amount_idr")
    val todayAmountIdr: Long = 0,
    @SerialName("today_tips")
    val todayTips: Int = 0
)

@Serializable
data class CourierTip(
    @SerialName("id")
    val id: String = "",
    @SerialName("order_id")
    val orderId: String = "",
    @SerialName("customer_id")
    val customerId: String = "",
    @SerialName("courier_id")
    val courierId: String = "",
    @SerialName("amount_idr")
    val amountIdr: Long = 0,
    @SerialName("service_sub_type")
    val serviceSubType: String? = null,
    @SerialName("status")
    val status: String? = null,
    @SerialName("created_at")
    val createdAt: String? = null
)
