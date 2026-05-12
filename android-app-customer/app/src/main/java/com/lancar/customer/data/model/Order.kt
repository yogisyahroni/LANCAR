package com.lancar.customer.data.model

import androidx.room.ColumnInfo
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
    @ColumnInfo(name = "id")
    @SerializedName("id")
    val localId: Long = 0,

    @ColumnInfo(name = "order_id")
    @SerializedName("order_id")
    val orderId: String = "",

    @ColumnInfo(name = "pickup_address")
    @SerializedName("pickup_address")
    val pickupAddress: String = "",

    @ColumnInfo(name = "pickup_time")
    @SerializedName("pickup_time")
    val pickupTime: String = "",

    @ColumnInfo(name = "drop_address")
    @SerializedName("drop_address")
    val dropAddress: String = "",

    @ColumnInfo(name = "distance")
    @SerializedName("distance")
    val distance: String = "",

    @ColumnInfo(name = "fee")
    @SerializedName("fee")
    val fee: String = "",

    @ColumnInfo(name = "customer_name")
    @SerializedName("customer_name")
    val customerName: String = "",

    /**
     * Order status: pending, assigned, picked_up, in_transit, delivered, failed
     */
    @ColumnInfo(name = "status")
    @SerializedName("status")
    val status: String = "pending",

    /**
     * Timestamp when order was created/received
     */
    @ColumnInfo(name = "created_at")
    @SerializedName("created_at")
    val createdAt: Long = System.currentTimeMillis(),

    /**
     * Timestamp when order status was last updated
     */
    @ColumnInfo(name = "updated_at")
    @SerializedName("updated_at")
    var updatedAt: Long = System.currentTimeMillis(),

    @ColumnInfo(name = "needsSync")
    var needsSync: Boolean = true,

    /**
     * Flag indicating if scan data needs to be synced with backend
     */
    @ColumnInfo(name = "needsScanSync")
    var needsScanSync: Boolean = false,

    /**
     * Flag indicating if PoD data needs to be synced with backend
     */
    @ColumnInfo(name = "needsPodSync")
    var needsPodSync: Boolean = false,

    /**
     * Latitude of scan
     */
    @ColumnInfo(name = "scan_latitude")
    @SerializedName("scan_latitude")
    var scanLatitude: Double? = null,

    /**
     * Longitude of scan
     */
    @ColumnInfo(name = "scan_longitude")
    @SerializedName("scan_longitude")
    var scanLongitude: Double? = null,

    /**
     * Type of scan (e.g. 'pickup')
     */
    @ColumnInfo(name = "scan_type")
    @SerializedName("scan_type")
    var scanType: String? = null,

    /**
     * Proof of delivery image URI (local file path)
     */
    @ColumnInfo(name = "pod_image_uri")
    @SerializedName("pod_image_uri")
    var podImageUri: String? = null,

    /**
     * Signature data (base64 encoded or file path)
     */
    @ColumnInfo(name = "signature_data")
    @SerializedName("signature_data")
    var signatureData: String? = null,

    /**
     * Delivery notes/comments
     */
    @ColumnInfo(name = "delivery_notes")
    @SerializedName("delivery_notes")
    var deliveryNotes: String? = null,

    /**
     * Customer phone number for contact
     */
    @ColumnInfo(name = "customer_phone")
    @SerializedName("customer_phone")
    var phoneNumber: String? = null
)
