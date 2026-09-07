package com.tembus.courier.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Login Request
 *
 * Payload for POST /api/v1/auth/courier/login
 */
@Serializable
data class LoginRequest(
    @SerialName("username")
    val username: String,

    @SerialName("password")
    val password: String,

    @SerialName("device_id")
    val deviceId: String,

    @SerialName("device_info")
    val deviceInfo: Map<String, String> = emptyMap()
)

@Serializable
data class CourierOtpVerifyRequest(
    @SerialName("username")
    val username: String,

    @SerialName("code")
    val code: String,

    @SerialName("device_id")
    val deviceId: String,

    @SerialName("device_info")
    val deviceInfo: Map<String, String> = emptyMap()
)

/**
 * Login Response Data
 *
 * Returned by auth-service on successful login.
 */
@Serializable
data class LoginData(
    @SerialName("token")
    val token: String? = null,

    @SerialName("courier_id")
    val courierId: String? = null,

    @SerialName("name")
    val name: String? = null,

    @SerialName("phone")
    val phone: String? = null,

    @SerialName("vehicle_type")
    val vehicleType: String? = null,

    @SerialName("profile_photo_url")
    val profilePhotoUrl: String? = null,

    @SerialName("requires_otp")
    val requiresOtp: Boolean = false,

    @SerialName("otp_reason")
    val otpReason: String? = null
)

/**
 * Courier Profile Data
 *
 * Returned by GET /api/v1/courier/profile
 */
@Serializable
data class CourierZone(
    @SerialName("id") val id: String,
    @SerialName("name") val name: String? = null,
    @SerialName("code") val code: String? = null
)

@Serializable
data class CourierEnforcementAction(
    @SerialName("id") val id: String,
    @SerialName("courier_profile_id") val courierProfileId: String? = null,
    @SerialName("enforcement_type") val enforcementType: String,
    @SerialName("scope") val scope: String,
    @SerialName("market_code") val marketCode: String? = null,
    @SerialName("service_code") val serviceCode: String? = null,
    @SerialName("reason_category") val reasonCategory: String,
    @SerialName("actionable_reason") val actionableReason: String,
    @SerialName("disclosure_level") val disclosureLevel: String = "actionable",
    @SerialName("effective_from") val effectiveFrom: String? = null,
    @SerialName("effective_until") val effectiveUntil: String? = null,
    @SerialName("safe_job_policy") val safeJobPolicy: String = "allow_active_job_completion",
    @SerialName("status") val status: String,
    @SerialName("active_job_count") val activeJobCount: Int = 0,
    @SerialName("appeal_eligible") val appealEligible: Boolean = true
)

@Serializable
data class CourierProfile(
    @SerialName("courier_id")
    val courierId: String,

    @SerialName("name")
    val name: String,

    @SerialName("phone")
    val phone: String? = null,

    @SerialName("vehicle_type")
    val vehicleType: String? = null,

    @SerialName("application_channel")
    val applicationChannel: String = "on_demand",

    @SerialName("status")
    val status: String = "offline",

    @SerialName("presence_state")
    val presenceState: String = "offline",

    @SerialName("work_state")
    val workState: String = "idle",

    @SerialName("presence_reason")
    val presenceReason: String? = null,

    @SerialName("heartbeat_at")
    val heartbeatAt: String? = null,

    @SerialName("is_matchable")
    val isMatchable: Boolean = false,

    @SerialName("active_job_count")
    val activeJobCount: Int = 0,

    @SerialName("profile_photo_url")
    val profilePhotoUrl: String? = null,

    @SerialName("total_deliveries")
    val totalDeliveries: Int = 0,

    @SerialName("today_deliveries")
    val todayDeliveries: Int = 0,

    @SerialName("total_earnings_idr")
    val totalEarningsIdr: Int = 0,

    @SerialName("today_earnings_idr")
    val todayEarningsIdr: Int = 0,

    @SerialName("max_weight_capacity_kg")
    val maxWeightCapacityKg: Double? = null,

    @SerialName("max_packages_capacity")
    val maxPackagesCapacity: Int? = null,

    // FOOD-BIKE-029: radius jangkauan food delivery (1-20 km, dropdown driver)
    @SerialName("radius_max_km")
    val radiusMaxKm: Int = 1,

    @SerialName("current_zone")
    val currentZone: CourierZone? = null,

    @SerialName("enforcement_actions")
    val enforcementActions: List<CourierEnforcementAction> = emptyList()
)

@Serializable
data class DutyStatusResponse(
    @SerialName("success")
    val success: Boolean,

    @SerialName("message")
    val message: String
)

@Serializable
data class UpdateCapacityRequest(
    @SerialName("max_weight_capacity_kg")
    val maxWeightCapacityKg: Double?,

    @SerialName("max_packages_capacity")
    val maxPackagesCapacity: Int?
)

// FOOD-BIKE-029: request update radius jangkauan driver
@Serializable
data class UpdateRadiusRequest(
    @SerialName("radius_km")
    val radiusKm: Int
)

@Serializable
data class DutyStatusRequest(
    @SerialName("online")
    val online: Boolean,

    @SerialName("latitude")
    val latitude: Double? = null,

    @SerialName("longitude")
    val longitude: Double? = null,

    @SerialName("accuracy")
    val accuracy: Float? = null,

    @SerialName("presence_state")
    val presenceState: String? = null,

    @SerialName("presence_reason")
    val presenceReason: String? = null
)
