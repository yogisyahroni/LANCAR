package com.lancar.courier.data.model

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.google.gson.annotations.SerializedName

/**
 * Order Model for LANCAR Courier App
 * 
 * Represents an order assigned to a courier for delivery.
 * Used for both API communication and local database storage.
 */
@Entity(tableName = "orders")
data class Order(
    @PrimaryKey(autoGenerate = true)
    @SerializedName("id")
    val localId: Long = 0,

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
    val customerName: String,

    /**
     * Order status: pending, assigned, picked_up, in_transit, delivered, failed
     */
    @SerializedName("status")
    val status: String = "pending",

    /**
     * Timestamp when order was created/received
     */
    @SerializedName("created_at")
    val createdAt: Long = System.currentTimeMillis(),

    /**
     * Timestamp when order status was last updated
     */
    @SerializedName("updated_at")
    var updatedAt: Long = System.currentTimeMillis(),

    /**
     * Flag indicating if order needs to be synced with backend
     * true = needs sync, false = synced
     */
    var needsSync: Boolean = true,

    /**
     * Proof of delivery image URI (local file path)
     */
    @SerializedName("pod_image_uri")
    var podImageUri: String? = null,

    /**
     * Signature data (base64 encoded or file path)
     */
    @SerializedName("signature_data")
    var signatureData: String? = null,

    /**
     * Delivery notes/comments
     */
    @SerializedName("delivery_notes")
    var deliveryNotes: String? = null
)
