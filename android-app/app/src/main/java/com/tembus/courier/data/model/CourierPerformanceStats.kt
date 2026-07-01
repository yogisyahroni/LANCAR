package com.tembus.courier.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class CourierPerformanceStats(
    @SerialName("id") val courierId: String,
    @SerialName("ontime_deliveries_count") val ontimeDeliveries: Int,
    @SerialName("total_deliveries_count") val totalDeliveries: Int,
    @SerialName("docs_complete_pct") val docsCompletePct: Double,
    @SerialName("avg_partner_rating") val avgPartnerRating: Double,
    @SerialName("complaint_ratio_pct") val complaintRatioPct: Double,
    @SerialName("relay_score") val relayScore: Double,
    @SerialName("tier") val tier: String
)
