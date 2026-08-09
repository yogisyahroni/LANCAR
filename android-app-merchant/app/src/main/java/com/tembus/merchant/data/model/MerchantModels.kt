package com.tembus.merchant.data.model

import com.google.gson.annotations.SerializedName

/** Merchant profile — GET /api/v1/merchant/profile (response langsung Merchant, tanpa wrapper). */
data class Merchant(
    @SerializedName("id") val id: String = "",
    @SerializedName("user_id") val userId: String = "",
    @SerializedName("nama_toko") val namaToko: String = "",
    @SerializedName("alamat") val alamat: String = "",
    @SerializedName("lokasi_lat") val lokasiLat: Double? = null,
    @SerializedName("lokasi_lng") val lokasiLng: Double? = null,
    @SerializedName("jam_buka") val jamBuka: String? = null,
    @SerializedName("jam_tutup") val jamTutup: String? = null,
    @SerializedName("is_open") val isOpen: Boolean = false,
    @SerializedName("completion_rate_pct") val completionRatePct: Double = 0.0,
    @SerializedName("verification_status") val verificationStatus: String = "pending",
    // Rating restoran — di-update order-service tiap customer submit rating (FOOD-BIKE-059/060).
    @SerializedName("avg_rating") val avgRating: Double = 0.0,
    @SerializedName("rating_count") val ratingCount: Int = 0,
    @SerializedName("halal_cert_number") val halalCertNumber: String? = null,
    @SerializedName("halal_expiry_date") val halalExpiryDate: String? = null,
    @SerializedName("spp_irt_number") val sppIrtNumber: String? = null,
    @SerializedName("spp_irt_expiry_date") val sppIrtExpiryDate: String? = null,
    @SerializedName("bpom_number") val bpomNumber: String? = null,
    @SerializedName("bpom_expiry_date") val bpomExpiryDate: String? = null,
    @SerializedName("created_at") val createdAt: String? = null,
    @SerializedName("updated_at") val updatedAt: String? = null
) {
    val isApproved: Boolean get() = verificationStatus == "approved"
    val isRejected: Boolean get() = verificationStatus == "rejected"

    /** FB-092: dokumen pangan lengkap = halal + (SPP-IRT atau BPOM), belum expired. */
    val hasCompleteFoodDocs: Boolean
        get() = !halalCertNumber.isNullOrBlank() && !halalExpiryDate.isNullOrBlank() &&
            ((!sppIrtNumber.isNullOrBlank() && !sppIrtExpiryDate.isNullOrBlank()) ||
                (!bpomNumber.isNullOrBlank() && !bpomExpiryDate.isNullOrBlank()))
}

/** Menu item — CRUD /api/v1/merchant/menu. */
data class MenuItem(
    @SerializedName("id") val id: String = "",
    @SerializedName("merchant_id") val merchantId: String = "",
    @SerializedName("nama") val nama: String = "",
    @SerializedName("harga") val harga: Long = 0,
    @SerializedName("foto") val foto: String? = null,
    @SerializedName("kategori") val kategori: String = "",
    @SerializedName("prep_time_minutes") val prepTimeMinutes: Int = 15,
    @SerializedName("is_available") val isAvailable: Boolean = true,
    @SerializedName("created_at") val createdAt: String? = null,
    @SerializedName("updated_at") val updatedAt: String? = null
)

/** Request buat/update menu item. */
data class MenuItemRequest(
    @SerializedName("nama") val nama: String,
    @SerializedName("harga") val harga: Long,
    @SerializedName("foto") val foto: String? = null,
    @SerializedName("kategori") val kategori: String,
    @SerializedName("prep_time_minutes") val prepTimeMinutes: Int,
    @SerializedName("is_available") val isAvailable: Boolean? = null
)

data class AvailabilityRequest(
    @SerializedName("is_available") val isAvailable: Boolean
)

data class ToggleOpenRequest(
    @SerializedName("is_open") val isOpen: Boolean
)

/** Reject order food — reason wajib (FOOD-BIKE-017/021). FB-122: reject_reason enum. */
data class RejectOrderRequest(
    @SerializedName("reason") val reason: String,
    @SerializedName("reject_reason") val rejectReason: String
)

/** List wrapper: {orders, total, page, page_size}. */
data class OrderListResponse(
    @SerializedName("orders") val orders: List<MerchantOrder> = emptyList(),
    @SerializedName("total") val total: Int = 0,
    @SerializedName("page") val page: Int = 1,
    @SerializedName("page_size") val pageSize: Int = 20
)

/** Order food untuk merchant (MerchantOrderView backend). */
data class MerchantOrder(
    @SerializedName("id") val id: String = "",
    @SerializedName("order_number") val orderNumber: String = "",
    @SerializedName("status") val status: String = "",
    @SerializedName("customer_name") val customerName: String? = null,
    @SerializedName("customer_phone") val customerPhone: String? = null,
    @SerializedName("dropoff_address") val dropoffAddress: String? = null,
    @SerializedName("total_price_idr") val totalPriceIdr: Long = 0,
    @SerializedName("distance_km") val distanceKm: Double = 0.0,
    @SerializedName("merchant_accepted_at") val merchantAcceptedAt: String? = null,
    @SerializedName("food_ready_at") val foodReadyAt: String? = null,
    @SerializedName("created_at") val createdAt: String? = null,
    @SerializedName("items") val items: List<FoodOrderItem> = emptyList()
)

data class FoodOrderItem(
    @SerializedName("item_name") val itemName: String = "",
    @SerializedName("quantity") val quantity: Int = 1,
    @SerializedName("item_price") val itemPrice: Long = 0,
    @SerializedName("subtotal") val subtotal: Long = 0,
    @SerializedName("notes") val notes: String? = null
)

/** List wrapper menu: {items, total, page, page_size}. */
data class MenuListResponse(
    @SerializedName("items") val items: List<MenuItem> = emptyList(),
    @SerializedName("total") val total: Int = 0,
    @SerializedName("page") val page: Int = 1,
    @SerializedName("page_size") val pageSize: Int = 20
)

/** Struk pembelian — GET /api/v1/merchant/orders/{id}/struk. */
data class StrukData(
    @SerializedName("order_id") val orderId: String = "",
    @SerializedName("order_number") val orderNumber: String = "",
    @SerializedName("status") val status: String = "",
    @SerializedName("merchant_name") val merchantName: String = "",
    @SerializedName("merchant_address") val merchantAddress: String? = null,
    @SerializedName("customer_name") val customerName: String? = null,
    @SerializedName("dropoff_address") val dropoffAddress: String? = null,
    @SerializedName("handover_token") val handoverToken: String = "",
    @SerializedName("qr_code_data_uri") val qrCodeDataUri: String = "",
    @SerializedName("subtotal_idr") val subtotalIdr: Long = 0,
    @SerializedName("delivery_fee_idr") val deliveryFeeIdr: Long = 0,
    @SerializedName("total_price_idr") val totalPriceIdr: Long = 0,
    @SerializedName("created_at") val createdAt: String? = null,
    @SerializedName("items") val items: List<FoodOrderItem> = emptyList()
)

data class SuccessResponse(
    @SerializedName("success") val success: Boolean = false
)

// ── FB-086: Laporan penjualan merchant — GET /api/v1/merchant/reports?period=daily|weekly ──
/** TopSellingItem — item terlaris dalam periode. */
data class TopSellingItem(
    @SerializedName("item_name") val itemName: String = "",
    @SerializedName("quantity") val quantity: Int = 0,
    @SerializedName("revenue_idr") val revenueIdr: Long = 0
)

/** SalesReportSummary — ringkasan penjualan periode (response langsung, tanpa wrapper). */
data class SalesReportSummary(
    @SerializedName("period") val period: String = "daily",
    @SerializedName("total_orders") val totalOrders: Int = 0,
    @SerializedName("gmv_idr") val gmvIdr: Long = 0,
    @SerializedName("avg_order_value_idr") val avgOrderValueIdr: Long = 0,
    @SerializedName("top_items") val topItems: List<TopSellingItem> = emptyList()
)

// ── FB-113: Settlement / Payout Merchant ──
// GET /api/v1/merchant/settlements — riwayat pencairan (backend cron 5 menit).

/** SettlementRecord — satu baris riwayat pencairan. */
data class SettlementRecord(
    @SerializedName("id") val id: String = "",
    @SerializedName("order_id") val orderId: String = "",
    @SerializedName("payment_link_id") val paymentLinkId: String = "",
    @SerializedName("gross_item_price_idr") val grossItemPriceIdr: Long = 0,
    @SerializedName("merchant_fee_idr") val merchantFeeIdr: Long = 0,
    @SerializedName("promo_discount_idr") val promoDiscountIdr: Long = 0,
    @SerializedName("net_payout_idr") val netPayoutIdr: Long = 0,
    @SerializedName("status") val status: String = "HOLDING",
    @SerializedName("holding_release_at") val holdingReleaseAt: String? = null,
    @SerializedName("settled_at") val settledAt: String? = null,
    @SerializedName("disbursement_ref") val disbursementRef: String? = null,
    @SerializedName("failure_reason") val failureReason: String? = null,
    @SerializedName("created_at") val createdAt: String = ""
)

/** SettlementSummary — total cair, total ditahan, + daftar riwayat. */
data class SettlementSummary(
    @SerializedName("total_idr") val totalIdr: Long = 0,
    @SerializedName("holding_idr") val holdingIdr: Long = 0,
    @SerializedName("records") val records: List<SettlementRecord> = emptyList()
)

/** Pendaftaran merchant — POST /api/v1/merchant/register. */
data class RegisterMerchantRequest(
    @SerializedName("nama_toko") val namaToko: String,
    @SerializedName("alamat") val alamat: String,
    @SerializedName("lokasi_lat") val lokasiLat: Double? = null,
    @SerializedName("lokasi_lng") val lokasiLng: Double? = null,
    @SerializedName("jam_buka") val jamBuka: String? = null,
    @SerializedName("jam_tutup") val jamTutup: String? = null,
    @SerializedName("ktp_pemilik_url") val ktpPemilikUrl: String,
    @SerializedName("foto_tempat_usaha_url") val fotoTempatUsahaUrl: String,
    @SerializedName("rekening_bank_url") val rekeningBankUrl: String,
    @SerializedName("nib_url") val nibUrl: String? = null,
    // FB-092: dokumen pangan opsional saat daftar
    @SerializedName("halal_cert_number") val halalCertNumber: String? = null,
    @SerializedName("halal_expiry_date") val halalExpiryDate: String? = null,
    @SerializedName("spp_irt_number") val sppIrtNumber: String? = null,
    @SerializedName("spp_irt_expiry_date") val sppIrtExpiryDate: String? = null,
    @SerializedName("bpom_number") val bpomNumber: String? = null,
    @SerializedName("bpom_expiry_date") val bpomExpiryDate: String? = null
)

/** FB-092: update dokumen pangan — PUT /api/v1/merchant/food-docs (patch). */
data class UpdateFoodDocsRequest(
    @SerializedName("halal_cert_number") val halalCertNumber: String? = null,
    @SerializedName("halal_expiry_date") val halalExpiryDate: String? = null,
    @SerializedName("spp_irt_number") val sppIrtNumber: String? = null,
    @SerializedName("spp_irt_expiry_date") val sppIrtExpiryDate: String? = null,
    @SerializedName("bpom_number") val bpomNumber: String? = null,
    @SerializedName("bpom_expiry_date") val bpomExpiryDate: String? = null
)

// ── FB-098/099/100: Promo merchant (dibiayai merchant, bukan duit PT) ──
/** Promo merchant — /api/v1/merchant/promos (self-serve, tanpa approval admin). */
data class MerchantPromo(
    @SerializedName("id") val id: String = "",
    @SerializedName("merchant_id") val merchantId: String = "",
    @SerializedName("menu_item_id") val menuItemId: String? = null,
    @SerializedName("discount_type") val discountType: String = "percent",
    @SerializedName("discount_value") val discountValue: Long = 0,
    @SerializedName("max_discount_idr") val maxDiscountIdr: Long? = null,
    @SerializedName("starts_at") val startsAt: String = "",
    @SerializedName("ends_at") val endsAt: String = "",
    @SerializedName("is_active") val isActive: Boolean = true,
    @SerializedName("created_at") val createdAt: String? = null,
    @SerializedName("updated_at") val updatedAt: String? = null
)

/** Request buat promo. starts_at/ends_at RFC3339 (UTC). */
data class MerchantPromoRequest(
    @SerializedName("menu_item_id") val menuItemId: String? = null,
    @SerializedName("discount_type") val discountType: String,
    @SerializedName("discount_value") val discountValue: Long,
    @SerializedName("max_discount_idr") val maxDiscountIdr: Long? = null,
    @SerializedName("starts_at") val startsAt: String,
    @SerializedName("ends_at") val endsAt: String
)

/** List wrapper promo: {items, total, page, page_size}. */
data class PromoListResponse(
    @SerializedName("items") val items: List<MerchantPromo> = emptyList(),
    @SerializedName("total") val total: Int = 0,
    @SerializedName("page") val page: Int = 1,
    @SerializedName("page_size") val pageSize: Int = 20
)

data class PromoActiveRequest(
    @SerializedName("is_active") val isActive: Boolean
)
