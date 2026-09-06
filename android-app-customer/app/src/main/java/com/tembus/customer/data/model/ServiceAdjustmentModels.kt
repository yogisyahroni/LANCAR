package com.tembus.customer.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class ServiceAdjustmentItem(
    @SerialName("code") val code: String,
    @SerialName("label") val label: String,
    @SerialName("type") val type: String,
    @SerialName("quantity") val quantity: Long,
    @SerialName("unit_price_idr") val unitPriceIdr: Long,
    @SerialName("total_idr") val totalIdr: Long
)

@Serializable
data class ServiceAdjustment(
    @SerialName("id") val id: String,
    @SerialName("order_id") val orderId: String,
    @SerialName("reason") val reason: String,
    @SerialName("items") val items: List<ServiceAdjustmentItem> = emptyList(),
    @SerialName("initial_quote_id") val initialQuoteId: String = "",
    @SerialName("original_total_idr") val originalTotalIdr: Long = 0,
    @SerialName("delta_idr") val deltaIdr: Long = 0,
    @SerialName("proposed_total_idr") val proposedTotalIdr: Long = 0,
    @SerialName("approved_delta_idr") val approvedDeltaIdr: Long = 0,
    @SerialName("status") val status: String = "pending",
    @SerialName("financial_state") val financialState: String = "not_due",
    @SerialName("rejection_reason") val rejectionReason: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("updated_at") val updatedAt: String? = null
)

@Serializable
data class ServiceAdjustmentListResponse(
    @SerialName("adjustments") val adjustments: List<ServiceAdjustment> = emptyList(),
    @SerialName("count") val count: Int = 0
)

@Serializable
data class ServiceAdjustmentDecisionRequest(
    @SerialName("adjustment_id") val adjustmentId: String,
    @SerialName("decision") val decision: String,
    @SerialName("rejection_reason") val rejectionReason: String? = null
)
