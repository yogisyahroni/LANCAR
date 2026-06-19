package com.tembus.courier.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * FCM Notification Payload Model
 * 
 * Represents the structure of push notification data sent from the backend.
 * Maps to backend notification-service's SendNotificationRequest.
 */
@Serializable
data class FCMNotificationPayload(
    @SerialName("type")
    val type: String,           // "order_assignment", "order_status_update", etc.
    
    @SerialName("title")
    val title: String,
    
    @SerialName("body")
    val body: String,
    
    @SerialName("order_id")
    val orderId: String? = null,
    
    @SerialName("priority")
    val priority: Int = 0,      // 0=normal, 1=high, 2=urgent
    
    @SerialName("data")
    val data: Map<String, String>? = null
)

/**
 * Order Assignment Payload
 * 
 * Parsed from FCM notification payload when type="order_assignment"
 */
@Serializable
data class OrderAssignment(
    @SerialName("order_id")
    val orderId: String,
    
    @SerialName("pickup_address")
    val pickupAddress: String,
    
    @SerialName("pickup_time")
    val pickupTime: String,
    
    @SerialName("drop_address")
    val dropAddress: String,
    
    @SerialName("distance")
    val distance: String,
    
    @SerialName("fee")
    val fee: String,
    
    @SerialName("customer_name")
    val customerName: String
)

/**
 * FCM Token Registration Request
 * 
 * Sent to backend to register this device for push notifications.
 */
@Serializable
data class FCMTokenRequest(
    @SerialName("courier_id")
    val courierId: String,
    
    @SerialName("fcm_token")
    val fcmToken: String,
    
    @SerialName("device_id")
    val deviceId: String,
    
    @SerialName("platform")
    val platform: String = "android",
    
    @SerialName("app_version")
    val appVersion: String = "1.0.0"
)

/**
 * API Response wrapper
 */
@Serializable
data class ApiResponse<T>(
    @SerialName("success")
    val success: Boolean,
    
    @SerialName("data")
    val data: T?,
    
    @SerialName("message")
    val message: String?,

    @SerialName("code")
    val code: String? = null
)

/**
 * Package Scan Request
 */
@Serializable
data class ScanRequest(
    @SerialName("order_id")
    val orderId: String,
    
    @SerialName("scan_type")
    val scanType: String,
    
    @SerialName("latitude")
    val latitude: Double,
    
    @SerialName("longitude")
    val longitude: Double,

    @SerialName("accuracy")
    val accuracy: Float? = null,

    @SerialName("barcode_value")
    val barcodeValue: String? = null,

    @SerialName("package_code")
    val packageCode: String? = null,

    @SerialName("face_verification_id")
    val faceVerificationId: String? = null,

    @SerialName("override_reason")
    val overrideReason: String? = null,

    @SerialName("spoof_risk")
    val spoofRisk: String? = null,
    
    @SerialName("warehouse_id")
    val warehouseId: String? = null,
    
    @SerialName("photo_url")
    val photoUrl: String? = null,
    
    @SerialName("bag_number")
    val bagNumber: String? = null
)

@Serializable
data class CourierServiceProduct(
    @SerialName("code")
    val code: String,

    @SerialName("name")
    val name: String,

    @SerialName("description")
    val description: String = "",

    @SerialName("service_family")
    val serviceFamily: String = "regular",

    @SerialName("service_category")
    val serviceCategory: String = "on_demand",

    @SerialName("route_model")
    val routeModel: String = "p2p",

    @SerialName("max_eta_minutes")
    val maxEtaMinutes: Int = 0,

    @SerialName("max_distance_km")
    val maxDistanceKm: Double? = null,

    @SerialName("max_weight_kg")
    val maxWeightKg: Double? = null,

    @SerialName("vehicle_types")
    val vehicleTypes: List<String> = emptyList(),

    @SerialName("batching_allowed")
    val batchingAllowed: Boolean = false,

    @SerialName("max_packages_per_order")
    val maxPackagesPerOrder: Int = 1,

    @SerialName("max_active_orders_regular")
    val maxActiveOrdersRegular: Int = 3,

    @SerialName("max_active_orders_on_demand")
    val maxActiveOrdersOnDemand: Int = 1,

    @SerialName("same_customer_batching_required")
    val sameCustomerBatchingRequired: Boolean = true,

    @SerialName("allow_new_offer_while_pickup")
    val allowNewOfferWhilePickup: Boolean = false,

    @SerialName("allow_new_offer_while_delivery")
    val allowNewOfferWhileDelivery: Boolean = false,

    @SerialName("assignment_radius_pickup_km")
    val assignmentRadiusPickupKm: Double = 2.0,

    @SerialName("assignment_radius_delivery_km")
    val assignmentRadiusDeliveryKm: Double = 3.0,

    @SerialName("proof_geofence_radius_m")
    val proofGeofenceRadiusM: Int = 10,

    @SerialName("proof_min_accuracy_m")
    val proofMinAccuracyM: Int = 50,

    @SerialName("face_verification_required")
    val faceVerificationRequired: Boolean = true,

    @SerialName("failed_delivery_policy")
    val failedDeliveryPolicy: String = "must_deliver",

    @SerialName("pod_label")
    val podLabel: String = "POD",

    @SerialName("display_order")
    val displayOrder: Int = 100
)

@Serializable
data class CourierHotspot(
    @SerialName("id")
    val id: String,
    @SerialName("name")
    val name: String,
    @SerialName("code")
    val code: String? = null,
    @SerialName("pending_orders")
    val pendingOrders: Int = 0,
    @SerialName("latitude")
    val latitude: Double? = null,
    @SerialName("longitude")
    val longitude: Double? = null,
    @SerialName("intensity")
    val intensity: String = "low"
)

@Serializable
data class CancelPickupReason(
    @SerialName("code")
    val code: String,
    @SerialName("title")
    val title: String,
    @SerialName("description")
    val description: String
)

@Serializable
data class OrderStatusTransition(
    @SerialName("workflow_role")
    val workflowRole: String,
    @SerialName("from_status")
    val fromStatus: String,
    @SerialName("to_status")
    val toStatus: String,
    @SerialName("label")
    val label: String,
    @SerialName("description")
    val description: String? = null,
    @SerialName("requires_proof")
    val requiresProof: Boolean = false,
    @SerialName("requires_admin")
    val requiresAdmin: Boolean = false,
    @SerialName("display_order")
    val displayOrder: Int = 100,
    @SerialName("version")
    val version: Int = 1
)

@Serializable
data class CourierRoutePoint(
    @SerialName("latitude")
    val latitude: Double,
    @SerialName("longitude")
    val longitude: Double
)

@Serializable
data class CourierRouteSnapshot(
    @SerialName("generated_at")
    val generatedAt: String? = null,
    @SerialName("provider")
    val provider: String? = null,
    @SerialName("requested_provider")
    val requestedProvider: String? = null,
    @SerialName("active_provider")
    val activeProvider: String? = null,
    @SerialName("scope")
    val scope: String? = null,
    @SerialName("service_code")
    val serviceCode: String? = null,
    @SerialName("vehicle_type")
    val vehicleType: String? = null,
    @SerialName("route_profile")
    val routeProfile: String? = null,
    @SerialName("distance_km")
    val distanceKm: Double = 0.0,
    @SerialName("distance_meters")
    val distanceMeters: Int = 0,
    @SerialName("duration_seconds")
    val durationSeconds: Int = 0,
    @SerialName("eta_minutes")
    val etaMinutes: Int = 0,
    @SerialName("eta")
    val eta: String? = null,
    @SerialName("route_polyline")
    val routePolyline: String? = null,
    @SerialName("route_geometry")
    val routeGeometry: String? = null,
    @SerialName("traffic_aware")
    val trafficAware: Boolean = false,
    @SerialName("confidence")
    val confidence: String? = null,
    @SerialName("fallback_reason")
    val fallbackReason: String? = null
)

@Serializable
data class CourierRoutePreview(
    @SerialName("order_id")
    val orderId: String,
    @SerialName("distance_km")
    val distanceKm: Double = 0.0,
    @SerialName("eta_minutes")
    val etaMinutes: Int = 0,
    @SerialName("provider")
    val provider: String = "internal",
    @SerialName("polyline")
    val polyline: List<CourierRoutePoint> = emptyList(),
    @SerialName("route_snapshot")
    val routeSnapshot: CourierRouteSnapshot? = null,
    @SerialName("route_polyline")
    val routePolyline: String? = null,
    @SerialName("route_profile")
    val routeProfile: String? = null,
    @SerialName("vehicle_type")
    val vehicleType: String? = null,
    @SerialName("fallback_reason")
    val fallbackReason: String? = null
)

@Serializable
data class CourierRouteLocation(
    @SerialName("latitude")
    val latitude: Double? = null,
    @SerialName("longitude")
    val longitude: Double? = null
)

@Serializable
data class CourierActiveRouteStop(
    @SerialName("order_id")
    val orderId: String,
    @SerialName("order_number")
    val orderNumber: String? = null,
    @SerialName("stop_type")
    val stopType: String = "pickup",
    @SerialName("address")
    val address: String? = null,
    @SerialName("latitude")
    val latitude: Double? = null,
    @SerialName("longitude")
    val longitude: Double? = null,
    @SerialName("service_code")
    val serviceCode: String? = null,
    @SerialName("package_count")
    val packageCount: Int = 1,
    @SerialName("detour_limit_km")
    val detourLimitKm: Double = 0.0
)

@Serializable
data class CourierActiveRouteSegment(
    @SerialName("to_order_id")
    val toOrderId: String? = null,
    @SerialName("to_stop_type")
    val toStopType: String? = null,
    @SerialName("provider")
    val provider: String? = null,
    @SerialName("distance_meters")
    val distanceMeters: Int = 0,
    @SerialName("duration_seconds")
    val durationSeconds: Int = 0,
    @SerialName("eta_minutes")
    val etaMinutes: Int = 0,
    @SerialName("route_profile")
    val routeProfile: String? = null,
    @SerialName("route_polyline")
    val routePolyline: String? = null,
    @SerialName("fallback_reason")
    val fallbackReason: String? = null
)

@Serializable
data class CourierActiveRoutePlan(
    @SerialName("courier_location")
    val courierLocation: CourierRouteLocation? = null,
    @SerialName("stops")
    val stops: List<CourierActiveRouteStop> = emptyList(),
    @SerialName("segments")
    val segments: List<CourierActiveRouteSegment> = emptyList(),
    @SerialName("total_distance_km")
    val totalDistanceKm: Double = 0.0,
    @SerialName("total_eta_minutes")
    val totalEtaMinutes: Int = 0,
    @SerialName("traffic_aware")
    val trafficAware: Boolean = false
)

@Serializable
data class MapsProviderConfig(
    @SerialName("enabled")
    val enabled: Boolean = true,
    @SerialName("requested_provider")
    val requestedProvider: String = "tomtom_maps",
    @SerialName("active_provider")
    val activeProvider: String = "tomtom_maps",
    @SerialName("fallback_provider")
    val fallbackProvider: String = "openstreetmap",
    @SerialName("scope")
    val scope: String = "courier_mobile",
    @SerialName("ttl_seconds")
    val ttlSeconds: Int = 300,
    @SerialName("reason")
    val reason: String? = null,
    @SerialName("capabilities")
    val capabilities: MapsProviderCapabilities = MapsProviderCapabilities(),
    @SerialName("openstreetmap")
    val openStreetMap: OpenStreetMapRuntimeConfig = OpenStreetMapRuntimeConfig()
)

@Serializable
data class MapsProviderCapabilities(
    @SerialName("tiles")
    val tiles: Boolean = false,
    @SerialName("routing")
    val routing: Boolean = false,
    @SerialName("geocoding")
    val geocoding: Boolean = false
)

@Serializable
data class OpenStreetMapRuntimeConfig(
    @SerialName("tile_url_template")
    val tileUrlTemplate: String? = null,
    @SerialName("attribution")
    val attribution: String? = null
)

@Serializable
data class CourierSafetyEventRequest(
    @SerialName("order_id")
    val orderId: String? = null,
    @SerialName("event_type")
    val eventType: String,
    @SerialName("severity")
    val severity: String = "medium",
    @SerialName("latitude")
    val latitude: Double? = null,
    @SerialName("longitude")
    val longitude: Double? = null,
    @SerialName("accuracy")
    val accuracy: Float? = null,
    @SerialName("message")
    val message: String? = null
)

@Serializable
data class CourierSafetyEventData(
    @SerialName("id")
    val id: String,
    @SerialName("status")
    val status: String,
    @SerialName("created_at")
    val createdAt: String
)

@Serializable
data class TripShareRequest(
    @SerialName("order_id")
    val orderId: String
)

@Serializable
data class TripShareData(
    @SerialName("url")
    val url: String,
    @SerialName("expires_at")
    val expiresAt: String
)

@Serializable
data class CourierTier(
    @SerialName("tier_code")
    val tierCode: String = "",
    @SerialName("tier_name")
    val tierName: String = "",
    @SerialName("benefit_summary")
    val benefitSummary: String = ""
)

@Serializable
data class CourierIncentive(
    @SerialName("code")
    val code: String,
    @SerialName("title")
    val title: String,
    @SerialName("description")
    val description: String = "",
    @SerialName("target_deliveries")
    val targetDeliveries: Int = 0,
    @SerialName("progress_deliveries")
    val progressDeliveries: Int = 0,
    @SerialName("progress_percent")
    val progressPercent: Int = 0,
    @SerialName("reward_idr")
    val rewardIdr: Int = 0,
    @SerialName("ends_at")
    val endsAt: String? = null
)

@Serializable
data class CourierPerformanceSummary(
    @SerialName("today_earnings_idr")
    val todayEarningsIdr: Int = 0,
    @SerialName("week_earnings_idr")
    val weekEarningsIdr: Int = 0,
    @SerialName("total_earnings_idr")
    val totalEarningsIdr: Int = 0,
    @SerialName("total_deliveries")
    val totalDeliveries: Int = 0,
    @SerialName("deliveries_30d")
    val deliveries30d: Int = 0,
    @SerialName("completion_rate_pct")
    val completionRatePct: Int = 0,
    @SerialName("acceptance_rate_pct")
    val acceptanceRatePct: Int = 0,
    @SerialName("avg_rating")
    val avgRating: Double = 0.0,
    @SerialName("rating_count")
    val ratingCount: Int = 0,
    @SerialName("tier")
    val tier: CourierTier = CourierTier(),
    @SerialName("incentives")
    val incentives: List<CourierIncentive> = emptyList()
)

@Serializable
data class CourierEarningsLedgerSummary(
    @SerialName("total_balance_idr")
    val totalBalanceIdr: Int = 0,
    @SerialName("available_balance_idr")
    val availableBalanceIdr: Int = 0,
    @SerialName("pending_balance_idr")
    val pendingBalanceIdr: Int = 0,
    @SerialName("payout_account")
    val payoutAccount: CourierPayoutAccount? = null
)

@Serializable
data class CourierPayoutAccount(
    @SerialName("id")
    val id: String? = null,
    @SerialName("bank_code")
    val bankCode: String? = null,
    @SerialName("account_number")
    val accountNumber: String? = null,
    @SerialName("account_name")
    val accountName: String? = null,
    @SerialName("status")
    val status: String? = null,
    @SerialName("verified_at")
    val verifiedAt: String? = null
)

@Serializable
data class CourierPayoutBalanceSummary(
    @SerialName("total_balance_idr")
    val totalBalanceIdr: Int = 0,
    @SerialName("available_balance_idr")
    val availableBalanceIdr: Int = 0,
    @SerialName("pending_balance_idr")
    val pendingBalanceIdr: Int = 0,
    @SerialName("requested_today_idr")
    val requestedTodayIdr: Int = 0,
    @SerialName("active_request_count")
    val activeRequestCount: Int = 0
)

@Serializable
data class CourierPayoutPolicy(
    @SerialName("min_amount_idr")
    val minAmountIdr: Int = 0,
    @SerialName("daily_limit_idr")
    val dailyLimitIdr: Int = 0,
    @SerialName("account_cooldown_hours")
    val accountCooldownHours: Int = 0,
    @SerialName("max_pending_requests")
    val maxPendingRequests: Int = 0
)

@Serializable
data class CourierPayoutEligibility(
    @SerialName("can_request")
    val canRequest: Boolean = false,
    @SerialName("reasons")
    val reasons: List<String> = emptyList(),
    @SerialName("max_requestable_idr")
    val maxRequestableIdr: Int = 0
)

@Serializable
data class CourierPayoutSummaryData(
    @SerialName("summary")
    val summary: CourierPayoutBalanceSummary = CourierPayoutBalanceSummary(),
    @SerialName("payout_account")
    val payoutAccount: CourierPayoutAccount? = null,
    @SerialName("policy")
    val policy: CourierPayoutPolicy = CourierPayoutPolicy(),
    @SerialName("eligibility")
    val eligibility: CourierPayoutEligibility = CourierPayoutEligibility()
)

@Serializable
data class CourierPayoutRequestItem(
    @SerialName("id")
    val id: String,
    @SerialName("request_number")
    val requestNumber: String,
    @SerialName("amount_idr")
    val amountIdr: Int = 0,
    @SerialName("fee_idr")
    val feeIdr: Int = 0,
    @SerialName("net_amount_idr")
    val netAmountIdr: Int = 0,
    @SerialName("status")
    val status: String = "requested",
    @SerialName("status_label")
    val statusLabel: String? = null,
    @SerialName("status_message")
    val statusMessage: String? = null,
    @SerialName("risk_action")
    val riskAction: String? = null,
    @SerialName("auto_approved")
    val autoApproved: Boolean = false,
    @SerialName("requires_manual_review")
    val requiresManualReview: Boolean = false,
    @SerialName("destination_snapshot")
    val destinationSnapshot: Map<String, String> = emptyMap(),
    @SerialName("failure_reason")
    val failureReason: String? = null,
    @SerialName("requested_at")
    val requestedAt: String? = null,
    @SerialName("reviewed_at")
    val reviewedAt: String? = null,
    @SerialName("processed_at")
    val processedAt: String? = null,
    @SerialName("paid_at")
    val paidAt: String? = null
)

@Serializable
data class CourierPayoutCreateRequest(
    @SerialName("amount_idr")
    val amountIdr: Int,
    @SerialName("transaction_pin")
    val transactionPin: String,
    @SerialName("idempotency_key")
    val idempotencyKey: String
)

@Serializable
data class CourierPayoutCreateData(
    @SerialName("request")
    val request: CourierPayoutRequestItem,
    @SerialName("available_balance_idr")
    val availableBalanceIdr: Int = 0
)

@Serializable
data class CourierEarningsTransaction(
    @SerialName("id")
    val id: String,
    @SerialName("order_id")
    val orderId: String? = null,
    @SerialName("order_number")
    val orderNumber: String? = null,
    @SerialName("source")
    val source: String = "delivery",
    @SerialName("direction")
    val direction: String = "credit",
    @SerialName("amount_idr")
    val amountIdr: Int = 0,
    @SerialName("settlement_status")
    val settlementStatus: String = "pending",
    @SerialName("description")
    val description: String? = null,
    @SerialName("created_at")
    val createdAt: String? = null
)

@Serializable
data class CourierEarningsLedger(
    @SerialName("summary")
    val summary: CourierEarningsLedgerSummary = CourierEarningsLedgerSummary(),
    @SerialName("transactions")
    val transactions: List<CourierEarningsTransaction> = emptyList()
)

@Serializable
data class CourierVehicleProfile(
    @SerialName("id")
    val id: String = "",
    @SerialName("plate_number")
    val plateNumber: String = "",
    @SerialName("vehicle_type")
    val vehicleType: String = "",
    @SerialName("vehicle_category")
    val vehicleCategory: String? = null,
    @SerialName("brand")
    val brand: String? = null,
    @SerialName("model")
    val model: String? = null,
    @SerialName("production_year")
    val productionYear: Int? = null,
    @SerialName("engine_cc")
    val engineCc: Int? = null,
    @SerialName("max_weight_kg")
    val maxWeightKg: Double? = null,
    @SerialName("verification_status")
    val verificationStatus: String = "pending"
)

@Serializable
data class CourierServiceCapability(
    @SerialName("id")
    val id: String = "",
    @SerialName("service_code")
    val serviceCode: String,
    @SerialName("service_name")
    val serviceName: String,
    @SerialName("description")
    val description: String = "",
    @SerialName("service_category")
    val serviceCategory: String = "on_demand",
    @SerialName("service_family")
    val serviceFamily: String = "regular",
    @SerialName("route_model")
    val routeModel: String = "p2p",
    @SerialName("status")
    val status: String = "pending_review",
    @SerialName("eligibility_reason")
    val eligibilityReason: String? = null,

    @SerialName("batching_allowed")
    val batchingAllowed: Boolean = false,

    @SerialName("max_packages_per_order")
    val maxPackagesPerOrder: Int = 1,

    @SerialName("max_active_orders_regular")
    val maxActiveOrdersRegular: Int = 3,

    @SerialName("max_active_orders_on_demand")
    val maxActiveOrdersOnDemand: Int = 1,

    @SerialName("same_customer_batching_required")
    val sameCustomerBatchingRequired: Boolean = true,

    @SerialName("allow_new_offer_while_pickup")
    val allowNewOfferWhilePickup: Boolean = false,

    @SerialName("allow_new_offer_while_delivery")
    val allowNewOfferWhileDelivery: Boolean = false,

    @SerialName("assignment_radius_pickup_km")
    val assignmentRadiusPickupKm: Double = 2.0,

    @SerialName("assignment_radius_delivery_km")
    val assignmentRadiusDeliveryKm: Double = 3.0,

    @SerialName("proof_geofence_radius_m")
    val proofGeofenceRadiusM: Int = 10,

    @SerialName("proof_min_accuracy_m")
    val proofMinAccuracyM: Int = 50,

    @SerialName("face_verification_required")
    val faceVerificationRequired: Boolean = true,

    @SerialName("failed_delivery_policy")
    val failedDeliveryPolicy: String = "must_deliver",

    @SerialName("pod_label")
    val podLabel: String = "POD",

    @SerialName("max_weight_kg")
    val maxWeightKg: Double? = null
)

@Serializable
data class CourierFaceVerificationData(
    @SerialName("verification_id")
    val verificationId: String,
    @SerialName("status")
    val status: String,
    @SerialName("verification_type")
    val verificationType: String,
    @SerialName("order_id")
    val orderId: String? = null,
    @SerialName("created_at")
    val createdAt: String? = null
)

@Serializable
data class CourierOnboardingStep(
    @SerialName("key")
    val key: String,
    @SerialName("title")
    val title: String,
    @SerialName("status")
    val status: String
)

@Serializable
data class CourierTrainingCompletion(
    @SerialName("training_key")
    val trainingKey: String,
    @SerialName("title")
    val title: String,
    @SerialName("completed_at")
    val completedAt: String
)

@Serializable
data class CourierCapabilityProfile(
    @SerialName("vehicle")
    val vehicle: CourierVehicleProfile? = null,
    @SerialName("vehicles")
    val vehicles: List<CourierVehicleProfile> = emptyList(),
    @SerialName("service_capabilities")
    val serviceCapabilities: List<CourierServiceCapability> = emptyList(),
    @SerialName("onboarding_steps")
    val onboardingSteps: List<CourierOnboardingStep> = emptyList(),
    @SerialName("training_completions")
    val trainingCompletions: List<CourierTrainingCompletion> = emptyList()
)

@Serializable
data class CourierTrainingCompleteRequest(
    @SerialName("training_key")
    val trainingKey: String = "on_demand_safety_v1",
    @SerialName("title")
    val title: String = "On-Demand Safety and Service Standard"
)

/**
 * Package Scan Response
 */
@Serializable
data class ScanResponse(
    @SerialName("status")
    val status: String,
    
    @SerialName("scan_id")
    val scanId: String,
    
    @SerialName("scan_type")
    val scanType: String,
    
    @SerialName("order_id")
    val orderId: String,
    
    @SerialName("recorded_at")
    val recordedAt: String
)

/**
 * Order Status Update Request
 */
@Serializable
data class StatusUpdateRequest(
    @SerialName("order_id")
    val orderId: String,
    
    @SerialName("status")
    val status: String,

    @SerialName("notes")
    val notes: String? = null,

    @SerialName("length")
    val length: Double? = null,

    @SerialName("width")
    val width: Double? = null,

    @SerialName("height")
    val height: Double? = null,

    @SerialName("weight")
    val weight: Double? = null
)

/**
 * App Version Info
 */
@Serializable
data class AppVersion(
    @SerialName("code")
    val code: Int,
    
    @SerialName("name")
    val name: String,
    
    @SerialName("force")
    val force: Boolean = false,
    
    @SerialName("update_url")
    val updateUrl: String,

    @SerialName("checksum_sha256")
    val checksumSha256: String? = null
)

/**
 * App Notification
 */
@Serializable
data class AppNotification(
    @SerialName("id")
    val id: String,
    
    @SerialName("title")
    val title: String,
    
    @SerialName("body")
    val body: String,
    
    @SerialName("type")
    val type: String? = null,
    
    @SerialName("category")
    val category: String? = null,
    
    @SerialName("priority")
    val priority: Int = 0,
    
    @SerialName("is_read")
    val isRead: Boolean = false,
    
    @SerialName("created_at")
    val createdAt: String
)

/**
 * Unread Count Response Data
 */
@Serializable
data class UnreadCountData(
    @SerialName("total")
    val total: Int,
    @SerialName("by_category")
    val byCategory: Map<String, Int>? = null
)
