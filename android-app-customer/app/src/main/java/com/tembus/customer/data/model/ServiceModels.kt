package com.tembus.customer.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// ============================================================
// TAMBAL BAN & TOWING — Service Types
// ============================================================

@Serializable
enum class ServiceCategory {
    @SerialName("on_demand") ON_DEMAND,
    @SerialName("tambal_ban") TAMBAL_BAN,
    @SerialName("towing") TOWING
}

@Serializable
enum class ServiceSubType {
    @SerialName("tambal_ban_motor") TAMBAL_BAN_MOTOR,
    @SerialName("tambal_ban_mobil") TAMBAL_BAN_MOBIL,
    @SerialName("towing_motor") TOWING_MOTOR,
    @SerialName("towing_mobil") TOWING_MOBIL
}

// ============================================================
// NEARBY COURIERS — Response
// ============================================================

@Serializable
data class NearbyCourier(
    @SerialName("courier_id") val courierId: String,
    @SerialName("courier_name") val courierName: String,
    @SerialName("rating") val rating: Double = 0.0,
    @SerialName("distance_km") val distanceKm: Double = 0.0,
    @SerialName("courier_service_price") val courierServicePrice: Long = 0,
    @SerialName("eta_minutes") val etaMinutes: Int = 0,
    @SerialName("vehicle_type") val vehicleType: String = "",
    @SerialName("vehicle_type_car") val vehicleTypeCar: String? = null,
    @SerialName("service_sub_type") val serviceSubType: String = "",
    @SerialName("status") val status: String = "", // available, conditional
    @SerialName("status_text") val statusText: String = "" // "Siap melayani", "Dalam perjalanan (~8 menit)"
)

@Serializable
data class NearbyCouriersResponse(
    @SerialName("couriers") val couriers: List<NearbyCourier> = emptyList(),
    @SerialName("count") val count: Int = 0,
    @SerialName("price_range") val priceRange: PriceRange = PriceRange()
)

@Serializable
data class PriceRange(
    @SerialName("min") val min: Long = 0,
    @SerialName("max") val max: Long = 0,
    @SerialName("avg") val avg: Long = 0
)

// ============================================================
// TAMBAL BAN HOME — Payload halaman utama (design Stitch)
// ============================================================

@Serializable
data class TambalBanServiceProduct(
    @SerialName("code") val code: String = "",
    @SerialName("name") val name: String = "",
    @SerialName("description") val description: String = "",
    @SerialName("base_fare_idr") val baseFareIdr: Long = 0,
    @SerialName("per_km_idr") val perKmIdr: Long = 0,
    @SerialName("platform_fee_idr") val platformFeeIdr: Long = 0,
    @SerialName("platform_fee_pct") val platformFeePct: Double = 0.0,
    @SerialName("is_enabled") val isEnabled: Boolean = true,
    @SerialName("vehicle_label") val vehicleLabel: String = ""
)

@Serializable
data class TambalBanHomeResponse(
    @SerialName("services") val services: List<TambalBanServiceProduct> = emptyList(),
    @SerialName("couriers") val couriers: List<NearbyCourier> = emptyList(),
    @SerialName("count") val count: Int = 0,
    @SerialName("price_range") val priceRange: PriceRange = PriceRange()
)

@Serializable
data class CourierDetail(
    @SerialName("courier_id") val courierId: String = "",
    @SerialName("courier_name") val courierName: String = "",
    @SerialName("rating") val rating: Double = 0.0,
    @SerialName("rating_count") val ratingCount: Int = 0,
    @SerialName("vehicle_type") val vehicleType: String = "",
    @SerialName("vehicle_type_car") val vehicleTypeCar: String? = null,
    @SerialName("distance_km") val distanceKm: Double = 0.0,
    @SerialName("eta_minutes") val etaMinutes: Int = 0,
    @SerialName("courier_service_price") val courierServicePrice: Long = 0,
    @SerialName("min_price") val minPrice: Long = 0,
    @SerialName("max_price") val maxPrice: Long = 0,
    @SerialName("radius_max_km") val radiusMaxKm: Int = 0,
    @SerialName("service_sub_type") val serviceSubType: String = "",
    @SerialName("status") val status: String = "",
    @SerialName("status_text") val statusText: String = "",
    @SerialName("is_online") val isOnline: Boolean = true
)

// ============================================================
// SETTLEMENT — Response
// ============================================================

@Serializable
data class SettlementResult(
    @SerialName("gross_total") val grossTotal: Long = 0,
    @SerialName("mdr_amount") val mdrAmount: Long = 0,
    @SerialName("tax_amount") val taxAmount: Long = 0,
    @SerialName("insurance_fee") val insuranceFee: Long = 0,
    @SerialName("operational_pool") val operationalPool: Long = 0,
    @SerialName("commission_basis") val commissionBasis: String = "",
    @SerialName("per_km_revenue") val perKmRevenue: Long = 0,
    @SerialName("base_fare_revenue") val baseFareRevenue: Long = 0,
    @SerialName("platform_commission_pct") val platformCommissionPct: Double = 0.0,
    @SerialName("platform_commission_amount") val platformCommissionAmt: Long = 0,
    @SerialName("courier_service_fee") val courierServiceFee: Long = 0,
    @SerialName("courier_base_fee") val courierBaseFee: Long = 0,
    @SerialName("courier_toll_reimburse") val courierTollReimburse: Long = 0,
    @SerialName("courier_per_km_earning") val courierPerKmEarning: Long = 0,
    @SerialName("estimated_net_earnings") val estimatedNetEarnings: Long = 0,
    @SerialName("settlement_model") val settlementModel: String = ""
)

// ============================================================
// SERVICE REPORTS
// ============================================================

@Serializable
data class TambalBanReport(
    @SerialName("id") val id: String = "",
    @SerialName("order_id") val orderId: String = "",
    @SerialName("courier_id") val courierId: String = "",
    @SerialName("tire_condition_before") val tireConditionBefore: String? = null,
    @SerialName("tire_photo_before_url") val tirePhotoBeforeUrl: String? = null,
    @SerialName("service_duration_minutes") val serviceDurationMinutes: Int? = null,
    @SerialName("materials_used") val materialsUsed: String? = null,
    @SerialName("notes") val notes: String? = null,
    @SerialName("tire_condition_after") val tireConditionAfter: String? = null,
    @SerialName("tire_photo_after_url") val tirePhotoAfterUrl: String? = null,
    @SerialName("completed_at") val completedAt: String? = null,
    @SerialName("created_at") val createdAt: String = ""
)

@Serializable
data class TowingReport(
    @SerialName("id") val id: String = "",
    @SerialName("order_id") val orderId: String = "",
    @SerialName("courier_id") val courierId: String = "",
    @SerialName("vehicle_condition_before") val vehicleConditionBefore: String? = null,
    @SerialName("vehicle_photo_before_url") val vehiclePhotoBeforeUrl: String? = null,
    @SerialName("odometer_reading") val odometerReading: Int? = null,
    @SerialName("loading_photo_url") val loadingPhotoUrl: String? = null,
    @SerialName("transit_started_at") val transitStartedAt: String? = null,
    @SerialName("transit_ended_at") val transitEndedAt: String? = null,
    @SerialName("unloading_photo_url") val unloadingPhotoUrl: String? = null,
    @SerialName("completion_photo_url") val completionPhotoUrl: String? = null,
    @SerialName("signature_url") val signatureUrl: String? = null,
    @SerialName("completed_at") val completedAt: String? = null,
    @SerialName("notes") val notes: String? = null,
    @SerialName("created_at") val createdAt: String = ""
)

// ============================================================
// COURIER AVAILABILITY STATE
// ============================================================

@Serializable
data class CourierAvailabilityState(
    @SerialName("courier_id") val courierId: String = "",
    @SerialName("current_state") val currentState: String = "idle",
    @SerialName("active_order_id") val activeOrderId: String? = null,
    @SerialName("latitude") val latitude: Double = 0.0,
    @SerialName("longitude") val longitude: Double = 0.0,
    @SerialName("last_location_update") val lastLocationUpdate: String? = null
)
