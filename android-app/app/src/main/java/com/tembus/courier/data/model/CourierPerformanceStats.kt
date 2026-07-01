package com.tembus.courier.data.model

import com.google.gson.annotations.SerializedName

data class CourierPerformanceStats(
    @SerializedName("id") val courierId: String,
    @SerializedName("ontime_deliveries_count") val ontimeDeliveries: Int,
    @SerializedName("total_deliveries_count") val totalDeliveries: Int,
    @SerializedName("docs_complete_pct") val docsCompletePct: Double,
    @SerializedName("avg_partner_rating") val avgPartnerRating: Double,
    @SerializedName("complaint_ratio_pct") val complaintRatioPct: Double,
    @SerializedName("relay_score") val relayScore: Double,
    @SerializedName("tier") val tier: String
)
