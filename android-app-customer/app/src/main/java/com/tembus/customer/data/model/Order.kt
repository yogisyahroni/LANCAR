package com.tembus.customer.data.model

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Entity(tableName = "orders")
@Serializable
data class Order(
    @PrimaryKey(autoGenerate = true)
    @ColumnInfo(name = "id")
    @SerialName("local_id")
    val localId: Long = 0,

    @ColumnInfo(name = "order_id")
    @SerialName("order_id") // FIX 2026-08-11: backend /customer/orders & /orders/{id} return order_id, bukan id
    val orderId: String = "",

    @ColumnInfo(name = "order_number")
    @SerialName("order_number")
    val orderNumber: String = "",

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

    @ColumnInfo(name = "status")
    @SerialName("status")
    val status: String = "pending",

    @ColumnInfo(name = "created_at")
    @SerialName("created_at")
    val createdAt: Long = System.currentTimeMillis(),

    @ColumnInfo(name = "updated_at")
    @SerialName("updated_at")
    var updatedAt: Long = System.currentTimeMillis(),

    @ColumnInfo(name = "needsSync")
    var needsSync: Boolean = true,

    @ColumnInfo(name = "needsScanSync")
    var needsScanSync: Boolean = false,

    @ColumnInfo(name = "needsPodSync")
    var needsPodSync: Boolean = false,

    @ColumnInfo(name = "scan_latitude")
    @SerialName("scan_latitude")
    var scanLatitude: Double? = null,

    @ColumnInfo(name = "scan_longitude")
    @SerialName("scan_longitude")
    var scanLongitude: Double? = null,

    @ColumnInfo(name = "scan_type")
    @SerialName("scan_type")
    var scanType: String? = null,

    @ColumnInfo(name = "pod_image_uri")
    @SerialName("pod_image_uri")
    var podImageUri: String? = null,

    @ColumnInfo(name = "signature_data")
    @SerialName("signature_data")
    var signatureData: String? = null,

    @ColumnInfo(name = "delivery_notes")
    @SerialName("delivery_notes")
    var deliveryNotes: String? = null,

    @ColumnInfo(name = "customer_phone")
    @SerialName("customer_phone")
    var phoneNumber: String? = null,

    @ColumnInfo(name = "courier_name")
    @SerialName("courier_name")
    var courierName: String? = null,

    // FB-113: URL foto profil kurir, untuk header chat food.
    @ColumnInfo(name = "courier_photo_url")
    @SerialName("courier_photo_url")
    var courierPhotoUrl: String? = null,

    // FOOD-BIKE-060: nama merchant (food delivery), untuk dialog rating merchant
    @ColumnInfo(name = "merchant_name")
    @SerialName("merchant_name")
    var merchantName: String? = null,

    @ColumnInfo(name = "merchant_id")
    @SerialName("merchant_id")
    var merchantId: String? = null,

    @ColumnInfo(name = "courier_vehicle")
    @SerialName("courier_vehicle")
    var courierVehicle: String? = null,

    @ColumnInfo(name = "courier_plate")
    @SerialName("courier_plate")
    var courierPlate: String? = null,

    @ColumnInfo(name = "courier_phone")
    @SerialName("courier_phone")
    var courierPhone: String? = null,

    @ColumnInfo(name = "eta_minutes")
    @SerialName("eta_minutes")
    var etaMinutes: Int? = null,

    @ColumnInfo(name = "service_sub_type")
    @SerialName("service_sub_type")
    var serviceSubType: String? = null,

    @ColumnInfo(name = "service_category")
    @SerialName("service_category")
    var serviceCategory: String? = null,

    @ColumnInfo(name = "contract_version")
    @SerialName("contract_version")
    var contractVersion: String? = null,

    @ColumnInfo(name = "state_version", defaultValue = "1")
    @SerialName("state_version")
    var stateVersion: Long = 1,

    @ColumnInfo(name = "quote_id")
    @SerialName("quote_id")
    var quoteId: String? = null,

    @ColumnInfo(name = "correlation_id")
    @SerialName("correlation_id")
    var correlationId: String? = null,

    // FB-111: rincian item pesanan food (snapshot food_order_items dari
    // backend getCustomerOrderById). Kosong [] untuk order non-food.
    @ColumnInfo(name = "food_items")
    @SerialName("food_items")
    var foodItems: List<FoodOrderItem> = emptyList(),

    // FB-121: catatan keseluruhan order (mis. "pisahin sambal semua").
    @ColumnInfo(name = "order_notes")
    @SerialName("order_notes")
    var orderNotes: String? = null
)

// FB-111: satu baris item pesanan food (nama, qty, catatan, harga beku).
@Serializable
data class FoodOrderItem(
    @SerialName("name")
    val name: String = "",
    @SerialName("quantity")
    val quantity: Int = 1,
    @SerialName("notes")
    val notes: String? = null,
    @SerialName("price")
    val price: Long = 0,
    @SerialName("subtotal")
    val subtotal: Long = 0,
    // FB-113: URL foto menu item (dari merchant_menu_items.foto),
    // dipakai thumbnail di kartu ringkasan pesanan food.
    @SerialName("photo_url")
    val photo: String? = null,
    // FB-108: pilihan varian yang dipilih customer saat order
    // (mis. [Level Pedas → Extra Pedas]).
    @SerialName("variants")
    val variants: List<FoodOrderItemVariantSnapshot> = emptyList()
)

// FB-108: snapshot satu pilihan varian (nama grup + opsi, harga delta).
@Serializable
data class FoodOrderItemVariantSnapshot(
    @SerialName("variant_id")
    val variantId: String = "",
    @SerialName("variant_name")
    val variantName: String = "",
    @SerialName("option_name")
    val optionName: String = "",
    @SerialName("price_delta")
    val priceDelta: Long = 0
)
