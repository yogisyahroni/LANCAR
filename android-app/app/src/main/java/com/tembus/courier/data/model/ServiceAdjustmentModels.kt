package com.tembus.courier.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class ServiceAdjustmentItem(
    @SerialName("code") val code: String,
    @SerialName("label") val label: String,
    @SerialName("type") val type: String,
    @SerialName("quantity") val quantity: Long,
    @SerialName("unit_price_idr") val unitPriceIdr: Long,
    @SerialName("total_idr") val totalIdr: Long = quantity * unitPriceIdr
)

@Serializable
data class ServiceAdjustmentProposalRequest(
    @SerialName("order_id") val orderId: String,
    @SerialName("reason") val reason: String,
    @SerialName("items") val items: List<ServiceAdjustmentItem>
)

@Serializable
data class ServiceAdjustment(
    @SerialName("id") val id: String,
    @SerialName("order_id") val orderId: String,
    @SerialName("reason") val reason: String,
    @SerialName("items") val items: List<ServiceAdjustmentItem> = emptyList(),
    @SerialName("original_total_idr") val originalTotalIdr: Long = 0,
    @SerialName("delta_idr") val deltaIdr: Long = 0,
    @SerialName("proposed_total_idr") val proposedTotalIdr: Long = 0,
    @SerialName("status") val status: String = "pending",
    @SerialName("financial_state") val financialState: String = "not_due"
)
