package com.tembus.customer.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class CreateOrderRequest(
    @SerialName("pickup_address") val pickupAddress: String,
    @SerialName("pickup_lat") val pickupLat: Double,
    @SerialName("pickup_lng") val pickupLng: Double,
    @SerialName("drop_address") val dropAddress: String,
    @SerialName("drop_lat") val dropLat: Double,
    @SerialName("drop_lng") val dropLng: Double,
    @SerialName("item_details") val itemDetails: String,
    @SerialName("estimated_price") val estimatedPrice: Long
)

@Serializable
data class DeliveryServicesResponse(
    @SerialName("success") val success: Boolean = false,
    @SerialName("services") val services: List<DeliveryServiceProduct> = emptyList()
)

@Serializable
data class DeliveryServiceProduct(
    @SerialName("code") val code: String,
    @SerialName("name") val name: String,
    @SerialName("description") val description: String = "",
    @SerialName("service_family") val serviceFamily: String = "regular",
    @SerialName("service_category") val serviceCategory: String = "on_demand",
    @SerialName("route_model") val routeModel: String = "p2p",
    @SerialName("is_enabled") val isEnabled: Boolean = true,
    @SerialName("display_order") val displayOrder: Int = 100,
    @SerialName("vehicle_types") val vehicleTypes: List<String> = emptyList(),
    @SerialName("max_eta_minutes") val maxEtaMinutes: Int = 0,
    @SerialName("max_distance_km") val maxDistanceKm: Double? = null,
    @SerialName("max_weight_kg") val maxWeightKg: Double? = null,
    @SerialName("uses_size_tier") val usesSizeTier: Boolean = false,
    @SerialName("requires_dimension_scan") val requiresDimensionScan: Boolean = false,
    @SerialName("allows_manual_dimension") val allowsManualDimension: Boolean = true,
    @SerialName("requires_pickup_verification") val requiresPickupVerification: Boolean = true,
    @SerialName("base_fare_idr") val baseFareIdr: Long = 0,
    @SerialName("included_distance_km") val includedDistanceKm: Double = 1.0,
    @SerialName("per_km_idr") val perKmIdr: Long = 0,
    @SerialName("service_multiplier") val serviceMultiplier: Double = 1.0,
    @SerialName("size_tiers") val sizeTiers: List<ServiceSizeTier> = emptyList()
)

@Serializable
data class ServiceSizeTier(
    @SerialName("code") val code: String = "",
    @SerialName("name") val name: String = "",
    @SerialName("max_weight_kg") val maxWeightKg: Double = 0.0,
    @SerialName("price_delta_idr") val priceDeltaIdr: Long = 0,
    @SerialName("multiplier") val multiplier: Double = 1.0
)

@Serializable
data class LocationPayload(
    @SerialName("lat") val lat: Double,
    @SerialName("lng") val lng: Double
)

@Serializable
data class DimensionsPayload(
    @SerialName("length") val length: Int,
    @SerialName("width") val width: Int,
    @SerialName("height") val height: Int
)

@Serializable
data class CustomerPriceEstimateRequest(
    @SerialName("pickup") val pickup: LocationPayload,
    @SerialName("dropoff") val dropoff: LocationPayload,
    @SerialName("dimensions") val dimensions: DimensionsPayload,
    @SerialName("weight_kg") val weightKg: Double,
    @SerialName("has_insurance") val hasInsurance: Boolean = false,
    @SerialName("item_value") val itemValue: Long = 0,
    @SerialName("dimension_scan_verified") val dimensionScanVerified: Boolean = true,
    @SerialName("service_code") val serviceCode: String,
    @SerialName("size_tier") val sizeTier: String? = null
)

@Serializable
data class RouteSnapshot(
    @SerialName("generated_at") val generatedAt: String = "",
    @SerialName("provider") val provider: String = "",
    @SerialName("requested_provider") val requestedProvider: String = "",
    @SerialName("active_provider") val activeProvider: String = "",
    @SerialName("scope") val scope: String = "",
    @SerialName("route_profile") val routeProfile: String = "",
    @SerialName("vehicle_type") val vehicleType: String = "",
    @SerialName("service_code") val serviceCode: String? = null,
    @SerialName("distance_km") val distanceKm: Double = 0.0,
    @SerialName("distance_meters") val distanceMeters: Int = 0,
    @SerialName("duration_seconds") val durationSeconds: Double? = null,
    @SerialName("eta") val eta: String? = null,
    @SerialName("eta_minutes") val etaMinutes: Int? = null,
    @SerialName("route_polyline") val routePolyline: String? = null,
    @SerialName("route_geometry") val routeGeometry: String? = null,
    @SerialName("traffic_aware") val trafficAware: Boolean = false,
    @SerialName("confidence") val confidence: String = "low",
    @SerialName("fallback_reason") val fallbackReason: String? = null
)

@Serializable
data class PriceBreakdown(
    @SerialName("service_code") val serviceCode: String = "",
    @SerialName("service_name") val serviceName: String = "",
    @SerialName("service_snapshot") val serviceSnapshot: DeliveryServiceProduct? = null,
    @SerialName("selected_size_tier") val selectedSizeTier: ServiceSizeTier? = null,
    @SerialName("distance_km") val distanceKm: Double = 0.0,
    @SerialName("route_snapshot") val routeSnapshot: RouteSnapshot? = null,
    @SerialName("base_price_idr") val basePriceIdr: Long = 0,
    @SerialName("actual_weight_kg") val actualWeightKg: Double = 0.0,
    @SerialName("dimensional_weight_kg") val dimensionalWeightKg: Double = 0.0,
    @SerialName("chargeable_weight_kg") val chargeableWeightKg: Double = 0.0,
    @SerialName("volumetric_surcharge_idr") val volumetricSurchargeIdr: Long = 0,
    @SerialName("insurance_premium_idr") val insurancePremiumIdr: Long = 0,
    @SerialName("dynamic_price_idr") val dynamicPriceIdr: Long = 0,
    @SerialName("delivery_model") val deliveryModel: String = "p2p",
    @SerialName("eta_minutes") val etaMinutes: Int = 0,
    @SerialName("total_price_idr") val totalPriceIdr: Long = 0
)

@Serializable
data class CustomerBulkPriceError(
    @SerialName("service_code") val serviceCode: String = "",
    @SerialName("code") val code: String = "",
    @SerialName("message") val message: String = ""
)

@Serializable
data class CustomerBulkPriceEstimateResponse(
    @SerialName("success") val success: Boolean = false,
    @SerialName("data") val data: List<PriceBreakdown> = emptyList(),
    @SerialName("errors") val errors: List<CustomerBulkPriceError> = emptyList(),
    @SerialName("message") val message: String? = null
)

@Serializable
data class CustomerOrderCreateRequest(
    @SerialName("pickup_address") val pickupAddress: String,
    @SerialName("pickup_location") val pickupLocation: LocationPayload,
    @SerialName("dropoff_address") val dropoffAddress: String,
    @SerialName("dropoff_location") val dropoffLocation: LocationPayload,
    @SerialName("recipient_name") val recipientName: String,
    @SerialName("recipient_phone") val recipientPhone: String,
    @SerialName("package_details") val packageDetails: PackageDetailsPayload,
    @SerialName("has_insurance") val hasInsurance: Boolean = false,
    @SerialName("item_value") val itemValue: Long = 0,
    @SerialName("schedule_type") val scheduleType: String = "now",
    @SerialName("customer_notes") val customerNotes: String = "",
    @SerialName("price_breakdown") val priceBreakdown: PriceBreakdown,
    @SerialName("service_code") val serviceCode: String,
    @SerialName("promo_code") val promoCode: String? = null,
    @SerialName("preferred_courier_id") val preferredCourierId: String? = null
)

@Serializable
data class PackageDetailsPayload(
    @SerialName("size_tier") val sizeTier: String,
    @SerialName("weight_kg") val weightKg: Double,
    @SerialName("dimensions") val dimensions: DimensionsPayload,
    @SerialName("dimensions_scanned") val dimensionsScanned: Boolean,
    @SerialName("requires_delivery_code") val requiresDeliveryCode: Boolean,
    @SerialName("item_description") val itemDescription: String
)

@Serializable
data class CustomerOrderCreateResponse(
    @SerialName("success") val success: Boolean = false,
    @SerialName("order") val order: CreatedCustomerOrder? = null,
    @SerialName("payment") val payment: CustomerPaymentSetup? = null,
    @SerialName("payment_setup_error") val paymentSetupError: String? = null,
    @SerialName("error") val error: String? = null
)

@Serializable
data class ReceiverLocationCreateRequest(
    @SerialName("pickup_address") val pickupAddress: String,
    @SerialName("pickup_location") val pickupLocation: LocationPayload?,
    @SerialName("recipient_name") val recipientName: String? = null,
    @SerialName("recipient_phone") val recipientPhone: String? = null,
    @SerialName("expires_hours") val expiresHours: Int = 24
)

@Serializable
data class ReceiverLocationRequestResponse(
    @SerialName("success") val success: Boolean = false,
    @SerialName("data") val data: ReceiverLocationLink? = null,
    @SerialName("message") val message: String? = null
)

@Serializable
data class ReceiverLocationLink(
    @SerialName("id") val id: String,
    @SerialName("status") val status: String = "pending",
    @SerialName("pickup_address") val pickupAddress: String = "",
    @SerialName("recipient_name") val recipientName: String? = null,
    @SerialName("submitted_address") val submittedAddress: String? = null,
    @SerialName("submitted_lat") val submittedLat: Double? = null,
    @SerialName("submitted_lng") val submittedLng: Double? = null,
    @SerialName("submitted_contact_name") val submittedContactName: String? = null,
    @SerialName("submitted_contact_phone_masked") val submittedContactPhoneMasked: String? = null,
    @SerialName("submitted_notes") val submittedNotes: String? = null,
    @SerialName("submitted_at") val submittedAt: String? = null,
    @SerialName("expires_at") val expiresAt: String = "",
    @SerialName("created_at") val createdAt: String = "",
    @SerialName("url") val url: String = "",
    @SerialName("token") val token: String = ""
)

@Serializable
data class CustomerAddressListResponse(
    @SerialName("success") val success: Boolean = false,
    @SerialName("data") val data: List<CustomerAddress> = emptyList(),
    @SerialName("message") val message: String? = null
)

@Serializable
data class CustomerAddressResponse(
    @SerialName("success") val success: Boolean = false,
    @SerialName("data") val data: CustomerAddress? = null,
    @SerialName("message") val message: String? = null
)

@Serializable
data class CustomerAddress(
    @SerialName("id") val id: String,
    @SerialName("label") val label: String,
    @SerialName("contact_name") val contactName: String? = null,
    @SerialName("contact_phone_masked") val contactPhoneMasked: String? = null,
    @SerialName("address") val address: String,
    @SerialName("lat") val lat: Double,
    @SerialName("lng") val lng: Double,
    @SerialName("notes") val notes: String? = null,
    @SerialName("kind") val kind: String = "receiver",
    @SerialName("is_favorite") val isFavorite: Boolean = false,
    @SerialName("usage_count") val usageCount: Int = 0,
    @SerialName("last_used_at") val lastUsedAt: String? = null,
    @SerialName("created_at") val createdAt: String = "",
    @SerialName("updated_at") val updatedAt: String = ""
)

@Serializable
data class CustomerAddressRequest(
    @SerialName("label") val label: String,
    @SerialName("contact_name") val contactName: String? = null,
    @SerialName("contact_phone") val contactPhone: String? = null,
    @SerialName("address") val address: String,
    @SerialName("location") val location: LocationPayload,
    @SerialName("notes") val notes: String? = null,
    @SerialName("kind") val kind: String = "receiver",
    @SerialName("is_favorite") val isFavorite: Boolean = true,
    @SerialName("mark_used") val markUsed: Boolean = true
)

@Serializable
data class CreatedCustomerOrder(
    @SerialName("id") val id: String,
    @SerialName("order_number") val orderNumber: String = "",
    @SerialName("total_price_idr") val totalPriceIdr: Long = 0,
    @SerialName("route_snapshot") val routeSnapshot: RouteSnapshot? = null
)

@Serializable
data class CustomerPaymentSetup(
    @SerialName("id") val id: String = "",
    @SerialName("provider") val provider: String? = null,
    @SerialName("method") val method: String = "",
    @SerialName("status") val status: String = "pending",
    @SerialName("payment_status") val paymentStatus: String = "pending",
    @SerialName("order_status") val orderStatus: String = "",
    @SerialName("active_payment_provider") val activePaymentProvider: String? = null,
    @SerialName("amount_idr") val amountIdr: Long = 0L,
    @SerialName("wallet_balance_idr") val walletBalanceIdr: Long = 0L,
    @SerialName("snap_token") val snapToken: String? = null,
    @SerialName("redirect_url") val redirectUrl: String? = null,
    @SerialName("midtrans_order_id") val midtransOrderId: String? = null,
    @SerialName("expires_in") val expiresIn: Int = 0,
    @SerialName("expires_at") val expiresAt: String? = null
)

@Serializable
data class CustomerPaymentSessionResponse(
    @SerialName("success") val success: Boolean = false,
    @SerialName("payment") val payment: CustomerPaymentSetup? = null,
    @SerialName("payment_status") val paymentStatus: String? = null,
    @SerialName("order_status") val orderStatus: String? = null,
    @SerialName("redirect_url") val redirectUrl: String? = null,
    @SerialName("snap_token") val snapToken: String? = null,
    @SerialName("midtrans_order_id") val midtransOrderId: String? = null,
    @SerialName("expires_in") val expiresIn: Int = 0,
    @SerialName("expires_at") val expiresAt: String? = null,
    @SerialName("message") val message: String? = null,
    @SerialName("error") val error: String? = null
)

@Serializable
data class CustomerPaymentCreateRequest(
    @SerialName("payment_method") val paymentMethod: String
)

@Serializable
data class UpdateProfileRequest(
    @SerialName("name") val name: String,
    @SerialName("phone_number") val phoneNumber: String,
    @SerialName("agreed_to_terms") val agreedToTerms: Boolean = true
)

@Serializable
data class ProfileResponse(
    @SerialName("id") val id: String = "",
    @SerialName("name") val name: String = "",
    @SerialName("email") val email: String = "",
    @SerialName("phone_number") val phoneNumber: String = "",
    @SerialName("wallet_balance") val walletBalance: Long = 0L,
    @SerialName("profile_image_url") val profileImageUrl: String? = null,
    @SerialName("store_name") val storeName: String? = null,
    @SerialName("default_pickup_address") val defaultPickupAddress: String? = null
)

@Serializable
data class PaymentRequest(
    @SerialName("payment_method") val paymentMethod: String
)

@Serializable
data class PaymentResponse(
    @SerialName("payment_url") val paymentUrl: String? = null,
    @SerialName("status") val status: String
)

@Serializable
data class CreateDisputeRequest(
    @SerialName("order_id") val orderId: String,
    @SerialName("type") val type: String,
    @SerialName("description") val description: String,
    @SerialName("evidence_urls") val evidenceUrls: List<String>? = null,
    @SerialName("is_customer") val isCustomer: Boolean = true
)

@Serializable
data class UploadResponse(
    @SerialName("success") val success: Boolean,
    @SerialName("url") val url: String? = null,
    @SerialName("error") val error: String? = null
)

@Serializable
data class PresignResponse(
    @SerialName("url") val url: String,
    @SerialName("key") val key: String
)

@Serializable
data class CustomerDisputeResponse(
    @SerialName("id") val id: String,
    @SerialName("order_id") val orderId: String,
    @SerialName("type") val type: String,
    @SerialName("status") val status: String,
    @SerialName("created_at") val createdAt: String
)
