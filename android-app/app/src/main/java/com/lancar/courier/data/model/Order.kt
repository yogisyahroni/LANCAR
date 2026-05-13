package com.lancar.courier.data.model

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Order Model for LANCAR Courier App
 *
 * Represents an order assigned to a courier for delivery.
 * Used for both API communication and local database storage.
 */
@Entity(
    tableName = "orders",
    indices = [
        Index(value = ["order_id"]),
        Index(value = ["status"]),
        Index(value = ["needsSync"]),
        Index(value = ["needsScanSync"]),
        Index(value = ["needsPodSync"])
    ]
)
@Serializable
data class Order(
    @PrimaryKey(autoGenerate = true)
    @ColumnInfo(name = "id")
    @SerialName("id")
    val localId: Long = 0,

    @ColumnInfo(name = "order_id")
    @SerialName("order_id")
    val orderId: String = "",

    @ColumnInfo(name = "pickup_address")
    @SerialName("pickup_address")
    val pickupAddress: String = "",

    @ColumnInfo(name = "pickup_time")
    @SerialName("pickup_time")
    val pickupTime: String = "",

    @ColumnInfo(name = "drop_address")
    @SerialName("drop_address")
    val dropAddress: String = "",

    @ColumnInfo(name = "distance")
    @SerialName("distance")
    val distance: String = "",

    @ColumnInfo(name = "fee")
    @SerialName("fee")
    val fee: String = "",

    @ColumnInfo(name = "customer_name")
    @SerialName("customer_name")
    val customerName: String = "",

    /**
     * Order status: pending, assigned, picked_up, in_transit, delivered, failed
     */
    @ColumnInfo(name = "status")
    @SerialName("status")
    val status: String = "pending",

    /**
     * Timestamp when order was created/received
     */
    @ColumnInfo(name = "created_at")
    @SerialName("created_at")
    val createdAt: Long = System.currentTimeMillis(),

    /**
     * Timestamp when order status was last updated
     */
    @ColumnInfo(name = "updated_at")
    @SerialName("updated_at")
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
    @SerialName("scan_latitude")
    var scanLatitude: Double? = null,

    /**
     * Longitude of scan
     */
    @ColumnInfo(name = "scan_longitude")
    @SerialName("scan_longitude")
    var scanLongitude: Double? = null,

    /**
     * Type of scan (e.g. 'pickup')
     */
    @ColumnInfo(name = "scan_type")
    @SerialName("scan_type")
    var scanType: String? = null,

    /**
     * Proof of delivery image URI (local file path)
     */
    @ColumnInfo(name = "pod_image_uri")
    @SerialName("pod_image_uri")
    var podImageUri: String? = null,

    /**
     * Signature data (base64 encoded or file path)
     */
    @ColumnInfo(name = "signature_data")
    @SerialName("signature_data")
    var signatureData: String? = null,

    /**
     * Delivery notes/comments
     */
    @ColumnInfo(name = "delivery_notes")
    @SerialName("delivery_notes")
    var deliveryNotes: String? = null,

    /**
     * Customer phone number for contact
     */
    @ColumnInfo(name = "customer_phone")
    @SerialName("customer_phone")
    var phoneNumber: String? = null
)