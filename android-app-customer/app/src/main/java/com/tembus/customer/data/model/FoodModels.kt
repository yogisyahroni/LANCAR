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
    // ADR 003 (2026-08-10): status halal merchant — halal_certified | non_halal | unknown.
    // Dipakai badge di kartu toko + filter chip (Semua/Halal/Non-Halal).
    @SerialName("halal_status") val halalStatus: String = "unknown",
    @SerialName("menu_items") val menuItems: List<FoodMenuItem> = emptyList()
) {
    val isHalalCertified: Boolean get() = halalStatus == "halal_certified"
    val isNonHalal: Boolean get() = halalStatus == "non_halal"
    /** Label badge untuk UI. */
    val halalLabel: String
        get() = when (halalStatus) {
            "halal_certified" -> "Halal"
            "non_halal" -> "Non-Halal"
            else -> ""
        }
}

@Serializable
data class FoodMenuItem(
    @SerialName("id") val id: String,
    @SerialName("merchant_id") val merchantId: String = "",
    @SerialName("name") val name: String,
    @SerialName("price") val price: Long = 0,
    @SerialName("is_available") val isAvailable: Boolean = true,
    @SerialName("prep_time_minutes") val prepTimeMinutes: Int = 10,
    @SerialName("kategori") val kategori: String? = null,
    @SerialName("foto") val foto: String? = null,
    // FB-108: grup varian menu (Ukuran, Level Pedas, Tambahan...).
    // Kosong = item single-variant.
    @SerialName("variants") val variants: List<MenuItemVariant> = emptyList()
)

// FB-108: grup varian menu item (dengan opsi-opsinya).
@Serializable
data class MenuItemVariant(
    @SerialName("id") val id: String,
    @SerialName("menu_item_id") val menuItemId: String = "",
    @SerialName("nama") val nama: String,
    @SerialName("is_required") val isRequired: Boolean = false,
    @SerialName("min_select") val minSelect: Int = 0,
    @SerialName("max_select") val maxSelect: Int = 1,
    @SerialName("options") val options: List<MenuItemVariantOption> = emptyList()
)

// FB-108: satu opsi dalam grup varian (harga delta IDR).
@Serializable
data class MenuItemVariantOption(
    @SerialName("id") val id: String,
    @SerialName("variant_id") val variantId: String = "",
    @SerialName("nama") val nama: String,
    @SerialName("price_delta") val priceDelta: Long = 0,
    @SerialName("is_default") val isDefault: Boolean = false
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
    // FB-123: waktu mulai diproses (aktivasi → pending_merchant). Wajib kalau
    // is_scheduled=true. Same-day only, min now+30 menit.
    @SerialName("scheduled_at") val scheduledAt: String? = null,
    @SerialName("voucher_code") val voucherCode: String? = null, // FB-078
    @SerialName("order_notes") val orderNotes: String? = null // FB-121
)

@Serializable
data class FoodOrderItemRequest(
    @SerialName("menu_item_id") val menuItemId: String,
    @SerialName("quantity") val quantity: Int,
    @SerialName("notes") val notes: String? = null,
    // FB-108: pilihan varian yang dipilih (opsional).
    @SerialName("variants") val variants: List<FoodOrderItemVariantRequest> = emptyList()
)

// FB-108: satu pilihan varian dalam request checkout.
@Serializable
data class FoodOrderItemVariantRequest(
    @SerialName("variant_id") val variantId: String,
    @SerialName("option_id") val optionId: String
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
// FOOD-BIKE-070: Favorite Merchants (C3)
// ============================================================

@Serializable
data class FavoriteMerchant(
    @SerialName("merchant_id") val merchantId: String,
    @SerialName("merchant_name") val merchantName: String,
    @SerialName("merchant_address") val merchantAddress: String,
    @SerialName("is_open") val isOpen: Boolean,
    @SerialName("lat") val lat: Double,
    @SerialName("lng") val lng: Double,
    @SerialName("avg_rating") val avgRating: Double,
    @SerialName("rating_count") val ratingCount: Int,
    @SerialName("halal_status") val halalStatus: String,
    @SerialName("distance_km") val distanceKm: Double? = null,
    @SerialName("added_at") val addedAt: String
) {
    // Mirror FoodMerchant computed properties for UI consistency
    val isHalalCertified: Boolean get() = halalStatus == "halal_certified"
    val isNonHalal: Boolean get() = halalStatus == "non_halal"
    val name: String get() = merchantName
    val address: String get() = merchantAddress
}

@Serializable
data class FavoriteMerchantsResponse(
    @SerialName("merchants") val merchants: List<FavoriteMerchant>
)

@Serializable
data class FavoriteCheckResponse(
    @SerialName("is_favorite") val isFavorite: Boolean
)

@Serializable
data class FavoriteActionResponse(
    @SerialName("success") val success: Boolean,
    @SerialName("message") val message: String? = null
)

// ============================================================
// CART STATE — dipegang in-memory di ViewModel (belum ada tabel cart)
// ============================================================

@Serializable
data class CartItem(
    val menuItem: FoodMenuItem,
    val quantity: Int = 1,
    val notes: String = "",
    // FB-108: pilihan varian yang dipilih customer (opsi per grup).
    val selectedVariants: List<FoodOrderItemVariantRequest> = emptyList(),
    // FB-108: label pilihan untuk ditampilkan (mis. "Level Pedas: Extra Pedas")
    val variantLabels: List<String> = emptyList()
) {
    // FB-108: harga satuan = harga dasar + total delta opsi terpilih.
    val unitPrice: Long
        get() = menuItem.price + selectedVariants.sumOf { sel ->
            menuItem.variants.flatMap { v -> v.options }
                .firstOrNull { it.id == sel.optionId }?.priceDelta ?: 0L
        }

    val subtotal: Long get() = unitPrice * quantity

    // FB-108: key unik per kombinasi varian (untuk LazyColumn key).
    val cartKey: String
        get() = if (selectedVariants.isEmpty()) menuItem.id
                else menuItem.id + "|" + selectedVariants.joinToString(",") { it.optionId }
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
