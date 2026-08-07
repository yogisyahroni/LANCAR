package com.tembus.customer.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// ============================================================
// FOOD DELIVERY — Models (FOOD-BIKE-055/056/057/075)
// ============================================================

@Serializable
data class FoodMerchant(
    @SerialName("id") val id: String,
    @SerialName("name") val name: String,
    @SerialName("address") val address: String = "",
    @SerialName("is_open") val isOpen: Boolean = true,
    @SerialName("verification_status") val verificationStatus: String = "approved",
    @SerialName("lat") val lat: Double = 0.0,
    @SerialName("lng") val lng: Double = 0.0,
    @SerialName("jam_buka") val jamBuka: String? = null,
    @SerialName("jam_tutup") val jamTutup: String? = null,
    @SerialName("distance_km") val distanceKm: Double? = null,
    @SerialName("avg_rating") val avgRating: Double? = null,
    @SerialName("rating_count") val ratingCount: Int = 0,
    @SerialName("menu_items") val menuItems: List<FoodMenuItem> = emptyList()
)

@Serializable
data class FoodMenuItem(
    @SerialName("id") val id: String,
    @SerialName("merchant_id") val merchantId: String = "",
    @SerialName("name") val name: String,
    @SerialName("price") val price: Long = 0,
    @SerialName("is_available") val isAvailable: Boolean = true,
    @SerialName("prep_time_minutes") val prepTimeMinutes: Int = 10,
    @SerialName("kategori") val kategori: String? = null,
    @SerialName("foto") val foto: String? = null
)

@Serializable
data class FoodMerchantListResponse(
    @SerialName("merchants") val merchants: List<FoodMerchant>
)

@Serializable
data class FoodMerchantDetailResponse(
    @SerialName("merchant") val merchant: FoodMerchant
)

// Request checkout — harga TIDAK dikirim client (zero-trust, dihitung server)
@Serializable
data class CreateFoodOrderRequest(
    @SerialName("merchant_id") val merchantId: String,
    @SerialName("items") val items: List<FoodOrderItemRequest>,
    @SerialName("dropoff_address") val dropoffAddress: String,
    @SerialName("dropoff_city") val dropoffCity: String? = null,
    @SerialName("dropoff_zip_code") val dropoffZipCode: String? = null,
    @SerialName("dropoff_lat") val dropoffLat: Double,
    @SerialName("dropoff_lng") val dropoffLng: Double,
    @SerialName("receiver_name") val receiverName: String? = null,
    @SerialName("receiver_phone") val receiverPhone: String? = null,
    @SerialName("is_scheduled") val isScheduled: Boolean = false,
    @SerialName("voucher_code") val voucherCode: String? = null // FB-078
)

@Serializable
data class FoodOrderItemRequest(
    @SerialName("menu_item_id") val menuItemId: String,
    @SerialName("quantity") val quantity: Int,
    @SerialName("notes") val notes: String? = null
)

// Response POST /orders/food — handler return Order object langsung
@Serializable
data class FoodOrderCreateResponse(
    @SerialName("id") val id: String = "",
    @SerialName("order_number") val orderNumber: String = "",
    @SerialName("status") val status: String = "",
    @SerialName("total_price_idr") val totalPriceIdr: Long = 0
)

// ============================================================
// CART STATE — dipegang in-memory di ViewModel (belum ada tabel cart)
// ============================================================

data class CartItem(
    val menuItem: FoodMenuItem,
    val quantity: Int = 1,
    val notes: String = ""
) {
    val subtotal: Long get() = menuItem.price * quantity
}

// ============================================================
// FB-084 REORDER — validasi ulang order lama sebelum "Pesan Lagi"
// ============================================================

@Serializable
data class ReorderInfoResponse(
    @SerialName("success") val success: Boolean,
    @SerialName("data") val data: ReorderInfo? = null,
    @SerialName("message") val message: String? = null
)

@Serializable
data class ReorderInfo(
    @SerialName("order_id") val orderId: String = "",
    @SerialName("merchant_id") val merchantId: String = "",
    @SerialName("merchant_name") val merchantName: String = "",
    @SerialName("merchant_open") val merchantOpen: Boolean = false,
    @SerialName("items") val items: List<ReorderItem> = emptyList(),
    @SerialName("total_old") val totalOld: Long = 0,
    @SerialName("total_new") val totalNew: Long = 0,
    @SerialName("has_changes") val hasChanges: Boolean = false
)

@Serializable
data class ReorderItem(
    @SerialName("menu_item_id") val menuItemId: String = "",
    @SerialName("item_name") val itemName: String = "",
    @SerialName("quantity") val quantity: Int = 1,
    @SerialName("notes") val notes: String = "",
    @SerialName("old_price") val oldPrice: Long = 0,
    @SerialName("new_price") val newPrice: Long = 0,
    @SerialName("available") val available: Boolean = true,
    @SerialName("price_changed") val priceChanged: Boolean = false
)
