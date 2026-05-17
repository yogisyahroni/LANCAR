package com.lancar.courier.data.model

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
    
    @SerialName("warehouse_id")
    val warehouseId: String? = null,
    
    @SerialName("photo_url")
    val photoUrl: String? = null,
    
    @SerialName("bag_number")
    val bagNumber: String? = null
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
    val updateUrl: String
)
