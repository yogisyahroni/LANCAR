package com.tembus.customer.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class RoadsideClaimRequest(
    @SerialName("order_id") val orderId: String,
    @SerialName("issue_type") val issueType: String,
    @SerialName("description") val description: String
)

@Serializable
data class RoadsideClaimResponse(
    @SerialName("id") val id: String,
    @SerialName("order_id") val orderId: String,
    @SerialName("report_id") val reportId: String,
    @SerialName("report_snapshot_hash") val reportSnapshotHash: String,
    @SerialName("issue_type") val issueType: String,
    @SerialName("description") val description: String,
    @SerialName("status") val status: String,
    @SerialName("created_at") val createdAt: String? = null
)

@Serializable
data class RoadsideRatingRequest(
    @SerialName("order_id") val orderId: String,
    @SerialName("overall_rating") val overallRating: Int,
    @SerialName("technician_quality_rating") val technicianQualityRating: Int,
    @SerialName("comment") val comment: String? = null
)

@Serializable
data class RoadsideRatingResponse(
    @SerialName("id") val id: String,
    @SerialName("order_id") val orderId: String,
    @SerialName("report_id") val reportId: String,
    @SerialName("report_snapshot_hash") val reportSnapshotHash: String,
    @SerialName("overall_rating") val overallRating: Int,
    @SerialName("technician_quality_rating") val technicianQualityRating: Int,
    @SerialName("comment") val comment: String? = null,
    @SerialName("created_at") val createdAt: String? = null
)

@Serializable
data class RoadsideCollectionRequest(
    @SerialName("adjustment_id") val adjustmentId: String
)

@Serializable
data class RoadsidePaymentIntent(
    @SerialName("id") val id: String,
    @SerialName("payment_number") val paymentNumber: String,
    @SerialName("amount_idr") val amountIdr: Long,
    @SerialName("status") val status: String,
    @SerialName("qr_code_url") val qrCodeUrl: String? = null,
    @SerialName("qr_code_string") val qrCodeString: String? = null,
    @SerialName("provider_reference") val providerReference: String? = null
)
