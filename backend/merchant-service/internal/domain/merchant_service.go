package domain

import (
	"context"
	"time"
)

// MerchantOrderView — tampilan order food untuk merchant (ringkasan + items).
type MerchantOrderView struct {
	ID                 string  `json:"id"`
	OrderNumber        string  `json:"order_number"`
	Status             string  `json:"status"`
	CustomerName       string  `json:"customer_name,omitempty"`
	CustomerPhone      string  `json:"customer_phone,omitempty"`
	DropoffAddress     string  `json:"dropoff_address,omitempty"`
	TotalPriceIDR      int64   `json:"total_price_idr"`
	DistanceKM         float64 `json:"distance_km"`
	MerchantAcceptedAt *string `json:"merchant_accepted_at,omitempty"`
	FoodReadyAt        *string `json:"food_ready_at,omitempty"`
	CreatedAt          string  `json:"created_at"`
	OrderNotes         string  `json:"order_notes,omitempty"` // FB-121
	CancellationReason string  `json:"cancellation_reason,omitempty"`
	RejectReason       string  `json:"reject_reason,omitempty"`
	// FB-123: order terjadwal — scheduled_at (UTC ISO). NULL = pesan langsung.
	ScheduledAt   *string             `json:"scheduled_at,omitempty"`
	PaymentStatus string              `json:"payment_status,omitempty"`
	PaymentMethod string              `json:"payment_method,omitempty"`
	IsNewCustomer bool                `json:"is_new_customer"`
	Items         []FoodOrderItemView `json:"items"`
}

type MerchantOrderTimelineEvent struct {
	ID          string `json:"id"`
	EventType   string `json:"event_type"`
	Description string `json:"description,omitempty"`
	ActorRole   string `json:"actor_role,omitempty"`
	FromStatus  string `json:"from_status,omitempty"`
	ToStatus    string `json:"to_status,omitempty"`
	Reason      string `json:"reason,omitempty"`
	Version     int64  `json:"version"`
	CreatedAt   string `json:"created_at"`
}

type MerchantOrderCourier struct {
	ID         string  `json:"id,omitempty"`
	Name       string  `json:"name,omitempty"`
	Phone      string  `json:"phone,omitempty"`
	Status     string  `json:"status,omitempty"`
	AssignedAt *string `json:"assigned_at,omitempty"`
	PickedUpAt *string `json:"picked_up_at,omitempty"`
}

type MerchantOrderFinancials struct {
	SubtotalIDR              int64 `json:"subtotal_idr"`
	DeliveryFeeIDR           int64 `json:"delivery_fee_idr"`
	PlatformFeeIDR           int64 `json:"platform_fee_idr"`
	MerchantPromoDiscountIDR int64 `json:"merchant_promo_discount_idr"`
	RefundedIDR              int64 `json:"refunded_idr"`
	NetMerchantIDR           int64 `json:"net_merchant_idr"`
}

// MerchantSubstitutionProposalView exposes the server-owned customer decision
// state so merchant staff can see whether an item replacement is pending,
// approved, or rejected without guessing from a local UI flag.
type MerchantSubstitutionProposalView struct {
	ID                  string  `json:"id"`
	OriginalItemID      string  `json:"original_menu_item_id"`
	OriginalItemName    string  `json:"original_item_name"`
	OriginalPrice       int64   `json:"original_price_idr"`
	ReplacementItemID   string  `json:"replacement_menu_item_id"`
	ReplacementItemName string  `json:"replacement_item_name"`
	ReplacementPrice    int64   `json:"replacement_price_idr"`
	PriceDifferenceIDR  int64   `json:"price_difference_idr"`
	Reason              string  `json:"reason,omitempty"`
	ProposedBy          string  `json:"proposed_by_role"`
	ProposedAt          string  `json:"proposed_at"`
	CustomerDecision    string  `json:"customer_decision"`
	CustomerDecidedAt   *string `json:"customer_decided_at,omitempty"`
}

// MerchantOrderDetail is a read model only. All values are loaded from the
// authoritative order/payment/refund/event tables; the web client cannot
// derive or overwrite them.
type MerchantOrderDetail struct {
	MerchantOrderView
	StateVersion  int64                              `json:"state_version"`
	Courier       *MerchantOrderCourier              `json:"courier,omitempty"`
	Financials    MerchantOrderFinancials            `json:"financials"`
	Timeline      []MerchantOrderTimelineEvent       `json:"timeline"`
	Substitutions []MerchantSubstitutionProposalView `json:"substitutions,omitempty"`
	DataAsOf      string                             `json:"data_as_of"`
}

// FoodOrderItemView — item dalam order food (dari food_order_items snapshot).
type FoodOrderItemView struct {
	// FB-087: menu_item_id diperlukan UI edit order untuk PUT items baru.
	MenuItemID string `json:"menu_item_id"`
	ItemName   string `json:"item_name"`
	Quantity   int    `json:"quantity"`
	ItemPrice  int64  `json:"item_price"`
	Subtotal   int64  `json:"subtotal"`
	Notes      string `json:"notes,omitempty"`
	// FB-108-FIX: varian/opsi terpilih (snapshot saat order dibuat).
	Variants []FoodOrderItemVariantView `json:"variants,omitempty"`
}

// FoodOrderItemVariantView — snapshot varian terpilih per item order.
type FoodOrderItemVariantView struct {
	VariantName string `json:"variant_name"`
	OptionName  string `json:"option_name"`
	PriceDelta  int64  `json:"price_delta"`
}

// PartialRejectResult — hasil refund item yang tidak tersedia.
type PartialRejectResult struct {
	OrderID          string `json:"order_id"`
	RefundID         string `json:"refund_id"`
	AmountIDR        int64  `json:"amount_idr"`
	RefundPercentage int    `json:"refund_percentage"`
	Status           string `json:"status"`
}

// MerchantService — interface layanan merchant (FOOD-BIKE-017).
type MerchantService interface {
	// Register mendaftarkan merchant baru (status SUBMITTED) + dokumen KYB.
	Register(ctx context.Context, userID string, req RegisterMerchantRequest) (*Merchant, error)
	// GetProfile ambil profil merchant milik user (nil jika belum daftar).
	GetProfile(ctx context.Context, userID string) (*Merchant, error)
	// UpdateProfile update profil merchant milik user.
	UpdateProfile(ctx context.Context, userID string, req UpdateMerchantRequest) (*Merchant, error)
	// ToggleOpen buka/tutup merchant (hanya jika onboarding ACTIVE).
	ToggleOpen(ctx context.Context, userID string, isOpen bool) (*Merchant, error)
	// SetAutoAcceptOrders controls whether paid food orders are accepted immediately.
	SetAutoAcceptOrders(ctx context.Context, userID string, enabled bool) (*Merchant, error)
	// GetDashboard returns the server-authoritative operational home read model.
	GetDashboard(ctx context.Context, userID string) (*MerchantDashboard, error)
	// Pause (FB-107): pause sementara sampai `until` — tidak mengubah is_open.
	Pause(ctx context.Context, userID string, until time.Time) (*Merchant, error)
	// Resume (FB-107): batalkan pause sementara lebih awal.
	Resume(ctx context.Context, userID string) (*Merchant, error)
	// Busy: tetap menerima order dengan tambahan waktu prep sampai `until`.
	Busy(ctx context.Context, userID string, until time.Time, extraPrepMinutes int) (*Merchant, error)
	// OverrideOperatingState is an audited admin/support override for temporary
	// closure or explicit open/closed state.
	OverrideOperatingState(ctx context.Context, actorID, actorRole, merchantID string, req MerchantOperatingStateOverrideRequest) (*Merchant, error)
	// UpdateFoodDocs update dokumen pangan (FB-092): nomor sertifikat halal
	// BPJPH, SPP-IRT, izin edar BPOM + masa berlaku. Buka toko ditolak
	// kalau belum lengkap / expired.
	UpdateFoodDocs(ctx context.Context, userID string, req UpdateFoodDocsRequest) (*Merchant, error)
	// UpdateBankAccount update rekening bank merchant (FB-114) — payout
	// settlement (FB-113). Rekening baru otomatis perlu verifikasi ulang admin.
	UpdateBankAccount(ctx context.Context, userID string, req UpdateBankAccountRequest) (*Merchant, error)

	// Menu
	CreateMenuItem(ctx context.Context, userID string, req CreateMenuItemRequest) (*MenuItem, error)
	UpdateMenuItem(ctx context.Context, userID string, itemID string, req UpdateMenuItemRequest) (*MenuItem, error)
	DeleteMenuItem(ctx context.Context, userID string, itemID string) error
	SetMenuItemAvailability(ctx context.Context, userID string, itemID string, available bool) (*MenuItem, error)
	UpdateMenuInventory(ctx context.Context, userID string, itemID string, req UpdateMenuInventoryRequest) (*MenuItem, error)
	ListMenuItems(ctx context.Context, userID string, page, pageSize int) ([]*MenuItem, int, error)
	// GetMenuItemVariants (FB-108): grup varian + opsi menu item milik user.
	GetMenuItemVariants(ctx context.Context, userID string, itemID string) ([]*MenuItemVariant, error)
	// ReplaceMenuItemVariants (FB-108): replace semua varian menu item
	// (transaksi atomik). Array kosong = hapus semua (single-variant lagi).
	ReplaceMenuItemVariants(ctx context.Context, userID string, itemID string, req ReplaceMenuItemVariantsRequest) ([]*MenuItemVariant, error)
	CreateMenuCategory(ctx context.Context, userID string, req CreateMenuCategoryRequest) (*MenuCategory, error)
	ListMenuCategories(ctx context.Context, userID string) ([]*MenuCategory, error)
	UpdateMenuCategory(ctx context.Context, userID, categoryID string, req UpdateMenuCategoryRequest) (*MenuCategory, error)
	ModerateMenuItem(ctx context.Context, actorID, actorRole, itemID string, req ModerateMenuItemRequest) (*MenuItem, error)
	ImportMenuCSV(ctx context.Context, userID, idempotencyKey string, content []byte) (*BulkMenuImportResult, error)
	GetCatalogReadiness(ctx context.Context, userID string) (*CatalogReadiness, error)
	ListCatalogPublications(ctx context.Context, userID string, limit int) ([]*CatalogPublication, error)
	PublishCatalog(ctx context.Context, userID, idempotencyKey string, expectedCatalogVersion *int64) (*CatalogPublication, error)
	RollbackCatalog(ctx context.Context, userID, idempotencyKey string, targetPublicationVersion int64) (*CatalogPublication, error)

	// Order action (FOOD-BIKE-017/021)
	// AcceptOrder menyetujui order food: status → preparing, set merchant_accepted_at.
	AcceptOrder(ctx context.Context, userID string, orderID string) error
	// RejectOrder menolak order food: status → cancelled_by_merchant + reason.
	// FB-122: rejectReason enum terstruktur (stok_habis/terlalu_sibuk/
	// tutup_mendadak/lainnya) untuk analitik.
	RejectOrder(ctx context.Context, userID string, orderID string, reason string, rejectReason string) error
	// MarkReady: merchant menandai order sudah siap (masak selesai) → status
	// preparing → searching (mulai cari kurir). FB-125: explicit "Pesanan Siap"
	// button (DoorDash-style Order Ready signal) sesuai best practice industri.
	MarkReady(ctx context.Context, userID string, orderID string) error
	// ListOrders list order food milik merchant (belum dikerjakan / riwayat).
	ListOrders(ctx context.Context, userID string, status string, page, pageSize int) ([]*MerchantOrderView, int, error)
	// GetOrderCounts returns canonical counts for the operational board tabs.
	GetOrderCounts(ctx context.Context, userID string) (*MerchantOrderCounts, error)
	GetOrderDetail(ctx context.Context, userID, orderID string) (*MerchantOrderDetail, error)
	// GetStruk ambil data struk pembelian + QR code untuk dicetak (FOOD-BIKE-034).
	GetStruk(ctx context.Context, userID string, orderID string) (*StrukData, error)

	// Report (FB-086)
	// GetSalesReport rekap penjualan merchant (daily | weekly): total order,
	// GMV, rata-rata nilai order, item terlaris.
	GetSalesReport(ctx context.Context, userID, period string) (*SalesReportSummary, error)
	// ExportSalesReportCSV export baris transaksi periode ke CSV (string).
	ExportSalesReportCSV(ctx context.Context, userID, period string) (string, error)
	// ListSettlements riwayat pencairan/payout merchant (FB-113):
	// total cair, total ditahan, + daftar settlement terbaru.
	ListSettlements(ctx context.Context, userID string) (*SettlementSummary, error)
	// RequestWithdrawal ajukan pencairan saldo merchant (M7).
	// Mengembalikan record request + saldo tersedia terkini.
	RequestWithdrawal(ctx context.Context, userID string, input CreateMerchantWithdrawalInput) (*MerchantWithdrawalRecord, int64, error)
	// ListWithdrawals riwayat permintaan pencairan merchant (M7).
	ListWithdrawals(ctx context.Context, userID string, limit int) ([]*MerchantWithdrawalRecord, error)
	// GetFinanceStatement returns the immutable, category-separated merchant
	// statement and merchant-scoped reconciliation queue.
	GetFinanceStatement(ctx context.Context, userID string, limit int) (*MerchantFinanceStatement, error)
	// GetCustomerReviews mengambil ringkasan + review customer dari merchant_ratings.
	GetCustomerReviews(ctx context.Context, userID string, page, pageSize int) (*MerchantReviewsResponse, error)
	// ReplyToCustomerReview membuat atau mengubah tanggapan merchant pada review miliknya.
	ReplyToCustomerReview(ctx context.Context, userID, reviewID string, input CreateMerchantReviewReplyInput) (*MerchantReviewReply, error)
	// GetQualityScore returns a versioned, windowed operational scorecard.
	GetQualityScore(ctx context.Context, userID string) (*MerchantQualityScore, error)
	// SubmitQualityAppeal lets the merchant challenge a material score decision.
	SubmitQualityAppeal(ctx context.Context, userID string, input MerchantQualityAppealRequest) (*MerchantQualityAppeal, error)
	// ReviewQualityAppeal is restricted to the existing admin/support roles.
	ReviewQualityAppeal(ctx context.Context, actorID, actorRole, appealID string, input MerchantQualityAppealReviewRequest) (*MerchantQualityAppeal, error)
	// GetEnforcementStatus returns the merchant-visible policy overlay,
	// including safe active-order state and appeal history.
	GetEnforcementStatus(ctx context.Context, userID string) (*MerchantEnforcementStatus, error)
	// SubmitEnforcementAppeal lets the merchant challenge an active policy
	// action without changing the action client-side.
	SubmitEnforcementAppeal(ctx context.Context, userID string, input MerchantEnforcementAppealRequest) (*MerchantEnforcementAppeal, error)

	// Operating hours ZIP: jadwal per hari dan penutupan tanggal khusus.
	GetOperatingHours(ctx context.Context, userID string) (*MerchantOperatingHoursResponse, error)
	ReplaceOperatingHours(ctx context.Context, userID string, hours []MerchantOperatingHour) (*MerchantOperatingHoursResponse, error)
	CreateSpecialClosure(ctx context.Context, userID string, input CreateMerchantSpecialClosureInput) (*MerchantSpecialClosure, error)
	DeleteSpecialClosure(ctx context.Context, userID, closureID string) error

	// Edit order (FB-087)
	// GetOrderEdit mengambil data order untuk layar edit merchant (status
	// pending_merchant, items + harga lama). Dipakai UI sebelum PUT items.
	GetOrderEdit(ctx context.Context, userID, orderID string) (*OrderEditData, error)
	// EditOrderItems mengubah item order food sebelum konfirmasi merchant.
	// Berlaku hanya status pending_merchant; nilai baru TIDAK boleh melebihi
	// nilai order awal (Grab pattern). Notif push otomatis ke customer.
	EditOrderItems(ctx context.Context, userID, orderID string, req EditOrderItemsRequest) (*EditOrderResult, error)
	// PartialRejectOrder membuat satu refund item tanpa membatalkan seluruh order.
	PartialRejectOrder(ctx context.Context, userID, orderID string, req PartialRejectOrderRequest) (*PartialRejectResult, error)
	// ProposeFoodSubstitution meneruskan proposal ke order-service yang menjadi
	// pemilik canonical substitution state dan perhitungan harga.
	ProposeFoodSubstitution(ctx context.Context, userID, orderID string, req ProposeMerchantSubstitutionRequest) (*MerchantSubstitutionProposal, error)
}

// MerchantOrderCancellationService is an optional capability so existing
// service test doubles remain source-compatible while the production service
// can expose cancellation after acceptance through order-service's canonical
// lifecycle boundary.
type MerchantOrderCancellationService interface {
	CancelOrder(ctx context.Context, userID, orderID, reason, idempotencyKey string) error
}
