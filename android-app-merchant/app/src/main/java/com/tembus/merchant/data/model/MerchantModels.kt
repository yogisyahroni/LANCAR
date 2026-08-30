package com.tembus.merchant.data.model

import com.google.gson.annotations.SerializedName

/** Merchant profile — GET /api/v1/merchant/profile (response langsung Merchant, tanpa wrapper). */
data class Merchant(
    @SerializedName("id") val id: String = "",
    @SerializedName("user_id") val userId: String = "",
    @SerializedName("owner_email") val ownerEmail: String = "",
    @SerializedName("owner_phone") val ownerPhone: String = "",
    @SerializedName("nama_toko") val namaToko: String = "",
    @SerializedName("alamat") val alamat: String = "",
    @SerializedName("lokasi_lat") val lokasiLat: Double? = null,
    @SerializedName("lokasi_lng") val lokasiLng: Double? = null,
    @SerializedName("jam_buka") val jamBuka: String? = null,
    @SerializedName("jam_tutup") val jamTutup: String? = null,
    @SerializedName("is_open") val isOpen: Boolean = false,
    // FB-109: minimum subtotal order (IDR). 0 = tanpa minimum.
    @SerializedName("min_order_idr") val minOrderIdr: Long = 0,
    // FB-107: pause sementara — ISO-8601 timestamp sampai kapan pause
    // (mis. "2026-08-09T12:30:00Z"). NULL = tidak pause. Auto un-pause
    // backend saat waktu habis, tanpa aksi merchant.
    @SerializedName("paused_until") val pausedUntil: String? = null,
    @SerializedName("completion_rate_pct") val completionRatePct: Double = 0.0,
    @SerializedName("verification_status") val verificationStatus: String = "pending",
    // Rating restoran — di-update order-service tiap customer submit rating (FOOD-BIKE-059/060).
    @SerializedName("avg_rating") val avgRating: Double = 0.0,
    @SerializedName("rating_count") val ratingCount: Int = 0,
    @SerializedName("halal_cert_number") val halalCertNumber: String? = null,
    @SerializedName("halal_expiry_date") val halalExpiryDate: String? = null,
    // ADR 003 (2026-08-10): status halal — halal_certified | non_halal | unknown.
    // Soft-gate: BUKAN syarat buka toko. Label & filter di sisi customer.
    @SerializedName("halal_status") val halalStatus: String = "unknown",
    @SerializedName("spp_irt_number") val sppIrtNumber: String? = null,
    @SerializedName("spp_irt_expiry_date") val sppIrtExpiryDate: String? = null,
    @SerializedName("bpom_number") val bpomNumber: String? = null,
    @SerializedName("bpom_expiry_date") val bpomExpiryDate: String? = null,
    // FB-114: rekening bank untuk payout (dari backend, verifikasi admin).
    @SerializedName("bank_name") val bankName: String? = null,
    @SerializedName("bank_account_number") val bankAccountNumber: String? = null,
    @SerializedName("bank_account_holder") val bankAccountHolder: String? = null,
    @SerializedName("bank_account_verified") val bankAccountVerified: Boolean = false,
    @SerializedName("payout_schedule") val payoutSchedule: String = "daily",
    @SerializedName("npwp") val npwp: String? = null,
    // X1/M1: jenis usaha — 'perorangan' (tanpa staff) | 'perusahaan' (wajib staff mgmt).
    @SerializedName("business_type") val businessType: String = "perorangan",
    @SerializedName("created_at") val createdAt: String? = null,
    @SerializedName("updated_at") val updatedAt: String? = null
) {
    val isApproved: Boolean get() = verificationStatus == "approved"
    val isRejected: Boolean get() = verificationStatus == "rejected"

    /** ADR 003: status halal untuk UI merchant (pilih di form dokumen pangan). */
    val isHalalCertified: Boolean get() = halalStatus == "halal_certified"
    val isNonHalal: Boolean get() = halalStatus == "non_halal"
    // X1/M1: corporate = perusahaan (punya staff management); individual = perorangan.
    val isCorporate: Boolean get() = businessType == "perusahaan"
}

data class MerchantNotification(
    @SerializedName("id") val id: String = "",
    @SerializedName("title") val title: String = "",
    @SerializedName("body") val body: String = "",
    @SerializedName("type") val type: String = "",
    @SerializedName("is_read") val isRead: Boolean = false,
    @SerializedName("deep_link") val deepLink: String? = null,
    @SerializedName("order_id") val orderId: String? = null,
    @SerializedName("created_at") val createdAt: String = ""
)

data class NotificationListResponse(
    @SerializedName("success") val success: Boolean = false,
    @SerializedName("data") val data: List<MerchantNotification> = emptyList()
)

data class MarkNotificationReadRequest(
    @SerializedName("notification_id") val notificationId: String
)

data class MerchantNotificationPreferences(
    @SerializedName("user_id") val userId: String = "",
    @SerializedName("new_order_alerts") val newOrderAlerts: Boolean = true,
    @SerializedName("order_cancellations") val orderCancellations: Boolean = true,
    @SerializedName("daily_summary_reports") val dailySummaryReports: Boolean = true,
    @SerializedName("promotional_updates") val promotionalUpdates: Boolean = false,
    @SerializedName("updated_at") val updatedAt: String = ""
)

data class NotificationPreferencesResponse(
    @SerializedName("success") val success: Boolean = false,
    @SerializedName("data") val data: MerchantNotificationPreferences = MerchantNotificationPreferences()
)

data class UpdateNotificationPreferencesRequest(
    @SerializedName("new_order_alerts") val newOrderAlerts: Boolean,
    @SerializedName("order_cancellations") val orderCancellations: Boolean,
    @SerializedName("daily_summary_reports") val dailySummaryReports: Boolean,
    @SerializedName("promotional_updates") val promotionalUpdates: Boolean
)

/** Menu item — CRUD /api/v1/merchant/menu. */
data class MenuItem(
    @SerializedName("id") val id: String = "",
    @SerializedName("merchant_id") val merchantId: String = "",
    @SerializedName("nama") val nama: String = "",
    @SerializedName("harga") val harga: Long = 0,
    @SerializedName("foto") val foto: String? = null,
    @SerializedName("deskripsi") val deskripsi: String? = null,
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
    @SerializedName("deskripsi") val deskripsi: String? = null,
    @SerializedName("kategori") val kategori: String,
    @SerializedName("prep_time_minutes") val prepTimeMinutes: Int,
    @SerializedName("is_available") val isAvailable: Boolean? = null
)

data class AvailabilityRequest(
    @SerializedName("is_available") val isAvailable: Boolean
)

// ── FB-108: varian menu ────────────────────────────────────────────────
/** Grup varian menu (Ukuran, Level Pedas, Tambahan...). */
data class MenuItemVariant(
    @SerializedName("id") val id: String = "",
    @SerializedName("menu_item_id") val menuItemId: String = "",
    @SerializedName("nama") val nama: String = "",
    @SerializedName("is_required") val isRequired: Boolean = false,
    @SerializedName("min_select") val minSelect: Int = 0,
    @SerializedName("max_select") val maxSelect: Int = 1,
    @SerializedName("options") val options: List<MenuItemVariantOption> = emptyList()
)

/** Satu opsi dalam grup varian (harga delta IDR). */
data class MenuItemVariantOption(
    @SerializedName("id") val id: String = "",
    @SerializedName("variant_id") val variantId: String = "",
    @SerializedName("nama") val nama: String = "",
    @SerializedName("price_delta") val priceDelta: Long = 0,
    @SerializedName("is_default") val isDefault: Boolean = false
)

/** Request PUT /merchant/menu/{id}/variants — replace atomik. */
data class ReplaceVariantsRequest(
    @SerializedName("variants") val variants: List<VariantGroupRequest>
)

/** Satu grup varian dalam request replace. */
data class VariantGroupRequest(
    @SerializedName("nama") val nama: String,
    @SerializedName("is_required") val isRequired: Boolean,
    @SerializedName("min_select") val minSelect: Int,
    @SerializedName("max_select") val maxSelect: Int,
    @SerializedName("options") val options: List<VariantOptionRequest>
)

/** Satu opsi dalam request replace. */
data class VariantOptionRequest(
    @SerializedName("nama") val nama: String,
    @SerializedName("price_delta") val priceDelta: Long
)

data class ToggleOpenRequest(
    @SerializedName("is_open") val isOpen: Boolean
)

/** FB-107: body POST /merchant/pause — durasi pause dalam menit (1-180). */
data class PauseRequest(
    @SerializedName("duration_minutes") val durationMinutes: Int
)

/** FB-109: body PATCH /merchant/profile — update minimal order (IDR). */
data class UpdateProfileRequest(
    @SerializedName("nama_toko") val namaToko: String? = null,
    @SerializedName("alamat") val alamat: String? = null,
    @SerializedName("min_order_idr") val minOrderIdr: Long? = null,
    @SerializedName("jam_buka") val jamBuka: String? = null,
    @SerializedName("jam_tutup") val jamTutup: String? = null,
    @SerializedName("payout_schedule") val payoutSchedule: String? = null,
    @SerializedName("npwp") val npwp: String? = null
)

data class MerchantOperatingHour(
    @SerializedName("weekday") val weekday: Int,
    @SerializedName("is_open") val isOpen: Boolean,
    @SerializedName("opens_at") val opensAt: String? = null,
    @SerializedName("closes_at") val closesAt: String? = null
)

data class MerchantSpecialClosure(
    @SerializedName("id") val id: String = "",
    @SerializedName("closure_date") val closureDate: String = "",
    @SerializedName("label") val label: String = ""
)

data class MerchantOperatingHoursResponse(
    @SerializedName("hours") val hours: List<MerchantOperatingHour> = emptyList(),
    @SerializedName("closures") val closures: List<MerchantSpecialClosure> = emptyList()
)

data class ReplaceOperatingHoursRequest(
    @SerializedName("hours") val hours: List<MerchantOperatingHour>
)

data class CreateSpecialClosureRequest(
    @SerializedName("closure_date") val closureDate: String,
    @SerializedName("label") val label: String
)

/** Reject order food — reason wajib (FOOD-BIKE-017/021). FB-122: reject_reason enum. */
data class RejectOrderRequest(
    @SerializedName("reason") val reason: String,
    @SerializedName("reject_reason") val rejectReason: String
)

/** FB-114: update rekening bank merchant (payout settlement). */
data class UpdateBankAccountRequest(
    @SerializedName("bank_name") val bankName: String,
    @SerializedName("bank_account_number") val bankAccountNumber: String,
    @SerializedName("bank_account_holder") val bankAccountHolder: String,
    @SerializedName("rekening_bank_url") val rekeningBankUrl: String? = null
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
    @SerializedName("order_notes") val orderNotes: String? = null, // FB-121
    @SerializedName("cancellation_reason") val cancellationReason: String? = null,
    @SerializedName("reject_reason") val rejectReason: String? = null,
    @SerializedName("scheduled_at") val scheduledAt: String? = null, // FB-123: order terjadwal
    @SerializedName("items") val items: List<FoodOrderItem> = emptyList()
)

data class FoodOrderItem(
    // FB-087: menu_item_id dari snapshot — dipakai UI edit order untuk PUT.
    @SerializedName("menu_item_id") val menuItemId: String = "",
    @SerializedName("item_name") val itemName: String = "",
    @SerializedName("quantity") val quantity: Int = 1,
    @SerializedName("item_price") val itemPrice: Long = 0,
    @SerializedName("subtotal") val subtotal: Long = 0,
    @SerializedName("notes") val notes: String? = null,
    // FB-108-FIX: snapshot varian/opsi terpilih saat order dibuat.
    @SerializedName("variants") val variants: List<FoodOrderItemVariant> = emptyList()
)

/** FoodOrderItemVariant — FB-108-FIX: satu varian terpilih (mis. Level: Level 3 Pedas). */
data class FoodOrderItemVariant(
    @SerializedName("variant_name") val variantName: String = "",
    @SerializedName("option_name") val optionName: String = "",
    @SerializedName("price_delta") val priceDelta: Long = 0
)

// ── FB-087: Edit order — GET/PUT /api/v1/merchant/orders/{id}/items ──

/** OrderEditData — data order untuk layar edit merchant (items + harga lama). */
data class OrderEditData(
    @SerializedName("order_id") val orderId: String = "",
    @SerializedName("status") val status: String = "",
    @SerializedName("subtotal_old_idr") val subtotalOldIdr: Long = 0,
    @SerializedName("delivery_fee_idr") val deliveryFeeIdr: Long = 0,
    @SerializedName("platform_fee_idr") val platformFeeIdr: Long = 0,
    @SerializedName("platform_fee_pct") val platformFeePct: Double = 0.0,
    @SerializedName("discount_idr") val discountIdr: Long = 0,
    @SerializedName("items") val items: List<FoodOrderItem> = emptyList()
)

/** EditOrderItemRequest — satu item dalam payload PUT edit order. */
data class EditOrderItemRequest(
    @SerializedName("menu_item_id") val menuItemId: String,
    @SerializedName("quantity") val quantity: Int,
    @SerializedName("notes") val notes: String? = null
)

/** EditOrderItemsRequest — body PUT edit order. */
data class EditOrderItemsRequest(
    @SerializedName("items") val items: List<EditOrderItemRequest>
)

/** EditOrderResult — respon PUT edit order (harga baru). */
data class EditOrderResult(
    @SerializedName("order_id") val orderId: String = "",
    @SerializedName("subtotal_idr") val subtotalIdr: Long = 0,
    @SerializedName("platform_fee_idr") val platformFeeIdr: Long = 0,
    @SerializedName("total_idr") val totalIdr: Long = 0
)

// ── Auto-update (FB-2026-08): contract backend + GitHub Releases ──

/** AppVersion — versi terbaru dari backend (GET api/v1/system/latest-version) atau GitHub Releases. */
data class AppVersion(
    @SerializedName("code") val code: Int,
    @SerializedName("name") val name: String,
    @SerializedName("force") val force: Boolean = false,
    @SerializedName("update_url") val updateUrl: String,
    @SerializedName("checksum_sha256") val checksumSha256: String? = null
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
    @SerializedName("merchant_accepted_at") val merchantAcceptedAt: String? = null,
    @SerializedName("food_ready_at") val foodReadyAt: String? = null,
    @SerializedName("cancellation_reason") val cancellationReason: String? = null,
    @SerializedName("reject_reason") val rejectReason: String? = null,
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

// FB-110: response upload foto menu — {url: "https://.../uploads/<uuid>.jpg"}
data class UploadMenuPhotoResponse(
    @SerializedName("url") val url: String? = null,
    @SerializedName("error") val error: String? = null
)

// ── FB-086: Laporan penjualan merchant — GET /api/v1/merchant/reports?period=daily|weekly ──
/** TopSellingItem — item terlaris dalam periode. */
data class TopSellingItem(
    @SerializedName("item_name") val itemName: String = "",
    @SerializedName("quantity") val quantity: Int = 0,
    @SerializedName("revenue_idr") val revenueIdr: Long = 0
)

/** SalesReportSummary — ringkasan penjualan periode (response langsung, tanpa wrapper). */
data class SalesReportPoint(
    @SerializedName("day") val day: String = "",
    @SerializedName("revenue_idr") val revenueIdr: Long = 0
)

data class SalesReportSummary(
    @SerializedName("period") val period: String = "daily",
    @SerializedName("total_orders") val totalOrders: Int = 0,
    @SerializedName("gmv_idr") val gmvIdr: Long = 0,
    @SerializedName("avg_order_value_idr") val avgOrderValueIdr: Long = 0,
    @SerializedName("top_items") val topItems: List<TopSellingItem> = emptyList(),
    @SerializedName("daily_breakdown") val dailyBreakdown: List<SalesReportPoint> = emptyList()
)

/** Review customer merchant — GET /api/v1/merchant/reviews. */
data class MerchantReview(
    @SerializedName("id") val id: String = "",
    @SerializedName("order_number") val orderNumber: String = "",
    @SerializedName("reviewer_name") val reviewerName: String = "Customer",
    @SerializedName("stars") val stars: Int = 0,
    @SerializedName("comment") val comment: String = "",
    @SerializedName("tags") val tags: List<String> = emptyList(),
    @SerializedName("created_at") val createdAt: String = "",
    @SerializedName("reply") val reply: MerchantReviewReply? = null
)

data class MerchantReviewReply(
    @SerializedName("id") val id: String = "",
    @SerializedName("body") val body: String = "",
    @SerializedName("created_at") val createdAt: String = "",
    @SerializedName("updated_at") val updatedAt: String = ""
)

data class MerchantRatingBucket(
    @SerializedName("stars") val stars: Int = 0,
    @SerializedName("count") val count: Int = 0
)

data class MerchantReviewReplyRequest(
    @SerializedName("body") val body: String
)

data class MerchantReviewsResponse(
    @SerializedName("avg_rating") val avgRating: Double = 0.0,
    @SerializedName("rating_count") val ratingCount: Int = 0,
    @SerializedName("reviews") val reviews: List<MerchantReview> = emptyList(),
    @SerializedName("rating_distribution") val ratingDistribution: List<MerchantRatingBucket> = emptyList(),
    @SerializedName("page") val page: Int = 1,
    @SerializedName("page_size") val pageSize: Int = 20
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
    @SerializedName("available_idr") val availableIdr: Long = 0,
    @SerializedName("records") val records: List<SettlementRecord> = emptyList()
)

/** M7: permintaan pencairan saldo merchant. */
data class MerchantWithdrawalRequest(
    @SerializedName("amount_idr") val amountIdr: Long,
    @SerializedName("bank_name") val bankName: String,
    @SerializedName("bank_account_number") val bankAccountNumber: String,
    @SerializedName("bank_account_holder") val bankAccountHolder: String,
    @SerializedName("idempotency_key") val idempotencyKey: String
)

/** M7: record riwayat pencairan merchant. */
data class MerchantWithdrawalRecord(
    @SerializedName("id") val id: String = "",
    @SerializedName("amount_idr") val amountIdr: Long = 0,
    @SerializedName("bank_name") val bankName: String = "",
    @SerializedName("bank_account_number") val bankAccountNumber: String = "",
    @SerializedName("bank_account_holder") val bankAccountHolder: String = "",
    @SerializedName("status") val status: String = "",
    @SerializedName("rejection_reason") val rejectionReason: String? = null,
    @SerializedName("disbursement_ref") val disbursementRef: String? = null,
    @SerializedName("created_at") val createdAt: String = ""
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
    // X1/M1: jenis usaha — 'perorangan' (default) | 'perusahaan' (wajib staff).
    @SerializedName("business_type") val businessType: String = "perorangan",
    // FB-092/ADR 003: dokumen pangan opsional saat daftar (soft-gate)
    @SerializedName("halal_status") val halalStatus: String? = null,
    @SerializedName("halal_cert_number") val halalCertNumber: String? = null,
    @SerializedName("halal_expiry_date") val halalExpiryDate: String? = null,
    @SerializedName("spp_irt_number") val sppIrtNumber: String? = null,
    @SerializedName("spp_irt_expiry_date") val sppIrtExpiryDate: String? = null,
    @SerializedName("bpom_number") val bpomNumber: String? = null,
    @SerializedName("bpom_expiry_date") val bpomExpiryDate: String? = null
)

/** FB-092/ADR 003: update dokumen pangan — PUT /api/v1/merchant/food-docs (patch). */
data class UpdateFoodDocsRequest(
    @SerializedName("halal_status") val halalStatus: String? = null,
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
