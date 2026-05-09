package com.lancar.courier.data.model

import com.google.gson.annotations.SerializedName

/**
 * FCM Notification Payload Model
 * 
 * Represents the structure of push notification data sent from the backend.
 * Maps to backend notification-service's SendNotificationRequest.
 */
data class FCMNotificationPayload(
    @SerializedName("type")
    val type: String,           // "order_assignment", "order_status_update", etc.
    
    @SerializedName("title")
    val title: String,
    
    @SerializedName("body")
    val body: String,
    
    @SerializedName("order_id")
    val orderId: String? = null,
    
    @SerializedName("priority")
    val priority: Int = 0,      // 0=normal, 1=high, 2=urgent
    
    @SerializedName("data")
    val data: Map<String, String>? = null
)

/**
 * Order Assignment Data
 * 
 * Parsed from FCM notification payload when type="order_assignment"
 */
data class OrderAssignment(
    @SerializedName("order_id")
    val orderId: String,
    
    @SerializedName("pickup_address")
    val pickupAddress: String,
    
    @SerializedName("pickup_time")
    val pickupTime: String,
    
    @SerializedName("drop_address")
    val dropAddress: String,
    
    @SerializedName("distance")
    val distance: String,
    
    @SerializedName("fee")
    val fee: String,
    
    @SerializedName("customer_name")
    val customerName: String
)

/**
 * FCM Token Registration Request
 * 
 * Sent to backend to register this device for push notifications.
 */
data class FCMTokenRequest(
    @SerializedName("courier_id")
    val courierId: String,
    
    @SerializedName("fcm_token")
    val fcmToken: String,
    
    @SerializedName("device_id")
    val deviceId: String,
    
    @SerializedName("platform")
    val platform: String = "android",
    
    @SerializedName("app_version")
    val appVersion: String
)

/**
 * API Response wrapper
 */
data class ApiResponse<T>(
    @SerializedName("success")
    val success: Boolean,
    
    @SerializedName("data")
    val data: T?,
    
    @SerializedName("message")
    val message: String?
)
