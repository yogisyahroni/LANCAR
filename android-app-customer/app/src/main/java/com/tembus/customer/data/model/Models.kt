package com.tembus.customer.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class FCMNotificationPayload(
    @SerialName("type")
    val type: String,
    
    @SerialName("title")
    val title: String,
    
    @SerialName("body")
    val body: String,
    
    @SerialName("order_id")
    val orderId: String? = null,
    
    @SerialName("priority")
    val priority: Int = 0,
    
    @SerialName("data")
    val data: Map<String, String>? = null
)

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
    val appVersion: String
)

@Serializable
data class ApiResponse<T>(
    @SerialName("success")
    val success: Boolean,
    
    @SerialName("data")
    val data: T? = null,
    
    @SerialName("message")
    val message: String? = null,

    @SerialName("code")
    val code: String? = null,

    @SerialName("action")
    val action: String? = null,

    @SerialName("retryable")
    val retryable: Boolean = false
)

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
    
    @SerialName("warehouse_id")
    val warehouseId: String? = null,
    
    @SerialName("photo_url")
    val photoUrl: String? = null,
    
    @SerialName("bag_number")
    val bagNumber: String? = null
)

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

@Serializable
data class StatusUpdateRequest(
    @SerialName("order_id")
    val orderId: String,
    
    @SerialName("status")
    val status: String,

    @SerialName("notes")
    val notes: String? = null
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
    val checksumSha256: String? = null,

    @SerialName("min_supported_code")
    val minSupportedCode: Int? = null,

    @SerialName("min_supported_name")
    val minSupportedName: String? = null,

    @SerialName("api_schema_version")
    val apiSchemaVersion: Int? = null,

    @SerialName("supported_schema_versions")
    val supportedSchemaVersions: List<Int> = emptyList(),

    @SerialName("compatibility")
    val compatibility: AppCompatibility? = null,

    @SerialName("update_mode")
    val updateMode: String = "none",

    @SerialName("update_required")
    val updateRequired: Boolean = false,

    @SerialName("hard_block")
    val hardBlock: Boolean = false,

    @SerialName("hard_block_reason")
    val hardBlockReason: String? = null,

    @SerialName("message")
    val message: String? = null,

    @SerialName("store_destinations")
    val storeDestinations: Map<String, String> = emptyMap(),

    @SerialName("recovery_access")
    val recoveryAccess: UpdateRecoveryAccess = UpdateRecoveryAccess()
)

@Serializable
data class AppCompatibility(
    @SerialName("status") val status: String = "unknown",
    @SerialName("upgrade_required") val upgradeRequired: Boolean = false,
    @SerialName("dynamic_features_enabled") val dynamicFeaturesEnabled: Boolean = false,
    @SerialName("reason") val reason: String? = null
)

@Serializable
data class UpdateRecoveryAccess(
    @SerialName("active_order") val activeOrder: Boolean = true,
    @SerialName("support") val support: Boolean = true,
    @SerialName("new_transactions") val newTransactions: Boolean = true
)
