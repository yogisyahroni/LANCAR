package com.tembus.courier.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Breakdown transparan harga home service (tambal_ban/towing).
 * Dikirim backend dari settlement_snapshot.pricing_breakdown.
 * Di-@Ignore di Order — transient, tidak disimpan ke Room.
 */
@Serializable
data class PricingBreakdown(
    @SerialName("service_fee_idr") val serviceFeeIdr: Int = 0,
    @SerialName("travel_fee_idr") val travelFeeIdr: Int = 0,
    @SerialName("platform_fee_idr") val platformFeeIdr: Int = 0,
    @SerialName("base_fare_idr") val baseFareIdr: Int = 0,
    @SerialName("per_km_idr") val perKmIdr: Int = 0,
    @SerialName("included_distance_km") val includedDistanceKm: Int = 1,
    @SerialName("platform_fee_pct") val platformFeePct: Double = 0.0,
    @SerialName("platform_commission_pct") val platformCommissionPct: Double = 0.0,
    @SerialName("live_distance_km") val liveDistanceKm: Double = 0.0
)