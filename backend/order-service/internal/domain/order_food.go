package domain

import (
	"context"
	"time"
)

// Auto-generated split of domain/order.go (god-file refactor).

type FoodOrderItemRequest struct {
	MenuID   string `json:"menu_item_id" validate:"required"`
	Quantity int    `json:"quantity" validate:"required,min=1,max=99"`
	Notes    string `json:"notes,omitempty"`
	// FB-108: pilihan varian (opsional). Harga delta dihitung server-side
	// dari menu_item_variant_options — client TIDAK kirim harga.
	Variants []FoodOrderItemVariantRequest `json:"variants,omitempty"`
}

type FoodOrderItemVariantRequest struct {
	VariantID string `json:"variant_id" validate:"required"`
	OptionID  string `json:"option_id" validate:"required"`
}

type CreateFoodOrderRequest struct {
	MerchantID     string                 `json:"merchant_id" validate:"required"`
	Items          []FoodOrderItemRequest `json:"items" validate:"required,min=1,dive"`
	DropoffAddress string                 `json:"dropoff_address" validate:"required"`
	DropoffCity    string                 `json:"dropoff_city,omitempty"`
	DropoffZipCode string                 `json:"dropoff_zip_code,omitempty"`
	DropoffLat     float64                `json:"dropoff_lat" validate:"required"`
	DropoffLng     float64                `json:"dropoff_lng" validate:"required"`
	ReceiverName   string                 `json:"receiver_name,omitempty"`
	ReceiverPhone  string                 `json:"receiver_phone,omitempty"`
	IsScheduled    bool                   `json:"is_scheduled"`
	// FB-123: waktu mulai diproses (aktivasi → pending_merchant). Wajib diisi
	// kalau IsScheduled. Same-day only, minimal now+30 menit, dalam jam
	// operasional merchant.
	ScheduledAt *time.Time `json:"scheduled_at,omitempty"`

	// FB-121: catatan keseluruhan order (mis. "pisahin sambal semua").
	OrderNotes string `json:"order_notes,omitempty"`

	// FB-089: antar tanpa kontak fisik (foto lokasi dropoff, POD tetap wajib).
	Contactless bool `json:"contactless,omitempty"`

	// FB-078: kode voucher diskon (opsional). Divalidasi + dihitung server-side.
	VoucherCode           string `json:"voucher_code,omitempty"`
	QuoteID               string `json:"quote_id,omitempty"`
	QuoteInputFingerprint string `json:"quote_input_fingerprint,omitempty"`
}

type FoodQuoteItem struct {
	MenuItemID string                 `json:"menu_item_id"`
	ItemName   string                 `json:"item_name"`
	UnitPrice  int64                  `json:"unit_price_idr"`
	Quantity   int                    `json:"quantity"`
	Subtotal   int64                  `json:"subtotal_idr"`
	Variants   []FoodOrderItemVariant `json:"variants,omitempty"`
}

type FoodQuoteResponse struct {
	QuoteID            string          `json:"quote_id"`
	InputFingerprint   string          `json:"input_fingerprint"`
	MerchantID         string          `json:"merchant_id"`
	Items              []FoodQuoteItem `json:"items"`
	SubtotalIDR        int64           `json:"subtotal_idr"`
	DeliveryFeeIDR     int64           `json:"delivery_fee_idr"`
	PlatformFeeIDR     int64           `json:"platform_fee_idr"`
	TaxIDR             int64           `json:"tax_idr"`
	DiscountIDR        int64           `json:"discount_idr"`
	TotalPriceIDR      int64           `json:"total_price_idr"`
	DistanceKM         float64         `json:"distance_km"`
	ETAMinutes         int             `json:"eta_minutes"`
	ETASource          string          `json:"eta_source"`
	PricingRuleVersion string          `json:"pricing_rule_version"`
	ExpiresAt          time.Time       `json:"expires_at"`
}

type FoodOrderItem struct {
	ID         string `json:"id"`
	OrderID    string `json:"order_id"`
	MenuItemID string `json:"menu_item_id"`
	ItemName   string `json:"item_name"`
	ItemPrice  int64  `json:"item_price"`
	Quantity   int    `json:"quantity"`
	Notes      string `json:"notes,omitempty"`
	Subtotal   int64  `json:"subtotal"`
	// FB-108: snapshot pilihan varian (nama + price_delta beku saat order).
	Variants []FoodOrderItemVariant `json:"variants,omitempty"`
}

type FoodOrderItemVariant struct {
	VariantID   string `json:"variant_id"`
	OptionID    string `json:"option_id"`
	VariantName string `json:"variant_name"`
	OptionName  string `json:"option_name"`
	PriceDelta  int64  `json:"price_delta"`
}

type FoodMerchantInfo struct {
	ID                 string  `json:"id"`
	Name               string  `json:"name"`
	Address            string  `json:"address"`
	IsOpen             bool    `json:"is_open"`
	VerificationStatus string  `json:"verification_status"`
	Lat                float64 `json:"lat"`
	Lng                float64 `json:"lng"`
	JamBuka            *string `json:"jam_buka,omitempty"`
	JamTutup           *string `json:"jam_tutup,omitempty"`
	// FB-107: pause sementara — merchant tidak terima order baru selama
	// PausedUntil > NOW(). NULL = tidak pause.
	PausedUntil *time.Time `json:"paused_until,omitempty"`
	// FB-109: minimum subtotal order (IDR). 0 = tanpa minimum.
	MinOrderIDR int64 `json:"min_order_idr"`
	// FOOD-BIKE-055: metrik browse merchant
	DistanceKM  *float64 `json:"distance_km,omitempty"`
	AvgRating   *float64 `json:"avg_rating,omitempty"`
	RatingCount int      `json:"rating_count"`
	// ADR 003 (2026-08-10): status halal merchant untuk label + filter
	// customer — halal_certified | non_halal | unknown.
	HalalStatus string             `json:"halal_status"`
	MenuItems   []FoodMenuItemInfo `json:"menu_items,omitempty"`
}

type FoodMenuItemInfo struct {
	ID              string     `json:"id"`
	MerchantID      string     `json:"merchant_id"`
	Name            string     `json:"name"`
	Price           int64      `json:"price"`
	IsAvailable     bool       `json:"is_available"`
	PrepTimeMinutes int        `json:"prep_time_minutes"`
	StockQuantity   *int       `json:"stock_quantity,omitempty"`
	DailySalesLimit *int       `json:"daily_sales_limit,omitempty"`
	DailySalesCount int        `json:"daily_sales_count"`
	SalesResetAt    *time.Time `json:"sales_limit_reset_at,omitempty"`
	// FOOD-BIKE-055/056: field UI tambahan
	Kategori *string `json:"kategori,omitempty"`
	Foto     *string `json:"foto,omitempty"`
	// FB-108: grup varian menu (Ukuran, Level Pedas, Tambahan, ...).
	// Kosong [] = item single-variant (perilaku lama).
	Variants []MenuItemVariant `json:"variants,omitempty"`
}

type MenuItemVariant struct {
	ID         string                  `json:"id"`
	MenuID     string                  `json:"menu_item_id"`
	Nama       string                  `json:"nama"`
	IsRequired bool                    `json:"is_required"`
	MinSelect  int                     `json:"min_select"`
	MaxSelect  int                     `json:"max_select"`
	Options    []MenuItemVariantOption `json:"options"`
}

type MenuItemVariantOption struct {
	ID         string `json:"id"`
	VariantID  string `json:"variant_id"`
	Nama       string `json:"nama"`
	PriceDelta int64  `json:"price_delta"`
	IsDefault  bool   `json:"is_default"`
}

type ReorderCheckItem struct {
	MenuItemID   string                 `json:"menu_item_id"`
	ItemName     string                 `json:"item_name"`
	Quantity     int                    `json:"quantity"`
	Notes        string                 `json:"notes,omitempty"`
	Variants     []FoodOrderItemVariant `json:"variants,omitempty"`
	OldPrice     int64                  `json:"old_price"`
	NewPrice     int64                  `json:"new_price"`
	Available    bool                   `json:"available"`
	PriceChanged bool                   `json:"price_changed"`
}

type ReorderCheckResult struct {
	OrderID      string             `json:"order_id"`
	MerchantID   string             `json:"merchant_id"`
	MerchantName string             `json:"merchant_name"`
	MerchantOpen bool               `json:"merchant_open"`
	Items        []ReorderCheckItem `json:"items"`
	TotalOld     int64              `json:"total_old"`
	TotalNew     int64              `json:"total_new"`
	HasChanges   bool               `json:"has_changes"`
}

type FoodRepository interface {
	GetFoodMerchant(ctx context.Context, merchantID string) (*FoodMerchantInfo, error)
	GetFoodMenuItems(ctx context.Context, menuIDs []string) ([]FoodMenuItemInfo, error)
	// GetMenuItemVariants — FB-108: ambil grup varian + opsi untuk menu IDs.
	// Map key = menu_item_id. Item tanpa varian tidak ada di map.
	GetMenuItemVariants(ctx context.Context, menuIDs []string) (map[string][]MenuItemVariant, error)
	CreateFoodOrderWithItems(ctx context.Context, order *Order, items []FoodOrderItem) error
	// GetFoodOrderItems — snapshot item food sebuah order (harga beku saat order,
	// dipakai refund partial per item FB-080).
	GetFoodOrderItems(ctx context.Context, orderID string) ([]FoodOrderItem, error)
	// ── FOOD-BIKE-021/022: transisi status food delivery ──
	// GetFoodOrderForMerchant mengambil order food milik merchant tertentu
	// (validasi ownership sebelum accept/reject).
	GetFoodOrderForMerchant(ctx context.Context, orderID, merchantID string) (*Order, error)
	// AcceptFoodOrder: pending_merchant → preparing, set merchant_accepted_at +
	// food_ready_at = NOW() + prep_time_minutes.
	AcceptFoodOrder(ctx context.Context, orderID string, prepMinutes int) error
	// RejectFoodOrder: pending_merchant → cancelled, set cancellation_reason +
	// cancelled_at (dipanggil merchant menolak ATAU timeout auto-cancel worker).
	RejectFoodOrder(ctx context.Context, orderID, reason string) error
	// GetPreparingFoodOrders: order food berstatus preparing yang siap transisi
	// ke searching (matching driver dimulai 5 menit sebelum food_ready_at).
	GetPreparingFoodOrders(ctx context.Context) ([]*Order, error)
	// GetPendingMerchantFoodOrders: order food pending_merchant yang belum direspon
	// merchant melebihi timeout (FOOD-BIKE-022: 3 menit) → auto-cancel.
	GetPendingMerchantFoodOrders(ctx context.Context, timeout time.Duration) ([]*Order, error)
	// FOOD-BIKE-055: browse merchant terdekat (is_open + approved) + menu
	ListFoodMerchants(ctx context.Context, lat, lng float64, search, halal string, limit int) ([]FoodMerchantInfo, error)
	GetFoodMerchantMenu(ctx context.Context, merchantID string) ([]FoodMenuItemInfo, error)
	// ── FOOD-BIKE-070: Favorite Merchants (C3) ──
	// AddFavoriteMerchant: customer bookmark merchant.
	AddFavoriteMerchant(ctx context.Context, customerID, merchantID string) error
	// RemoveFavoriteMerchant: customer hapus bookmark.
	RemoveFavoriteMerchant(ctx context.Context, customerID, merchantID string) error
	// ListFavoriteMerchants: customer lihat daftar favorite merchant + detail dasar.
	ListFavoriteMerchants(ctx context.Context, customerID string) ([]FoodMerchantInfo, error)
	// CheckIsFavoriteMerchant: cek apakah merchant sudah di-favorite customer.
	CheckIsFavoriteMerchant(ctx context.Context, customerID, merchantID string) (bool, error)
	// ── FB-088: batching driver food ──
	// GetSearchingFoodOrdersForBatch: order food `searching` tanpa batch_id
	// yang siap dipairing (sudah searching ≤ 2 menit, service food_delivery).
	GetSearchingFoodOrdersForBatch(ctx context.Context) ([]*Order, error)
	// FindBatchCandidate: pasangan untuk order tertentu — merchant sama,
	// dropoff ≤ maxRadiusKM, bukan customer yang sama, total max 2 order.
	FindBatchCandidate(ctx context.Context, orderID string, maxRadiusKM float64) (*Order, float64, error)
	// CreateFoodBatch: buat baris food_batches (status forming) + set batch_id
	// kedua order dalam SATU transaksi.
	CreateFoodBatch(ctx context.Context, batch *FoodBatch, orderAID, orderBID string) error
	// GetFoodBatchByOrderID: batch tempat order berada (untuk earnings/audit).
	GetFoodBatchByOrderID(ctx context.Context, orderID string) (*FoodBatch, error)
	// UpdateFoodBatchCourier: status forming/assigned → set courier_id saat
	// courier accept (dipanggil AcceptOrder untuk order batch food).
	UpdateFoodBatchCourier(ctx context.Context, batchID, courierID string) error
	// GetScheduledFoodOrdersDue — FB-123: order status 'scheduled' yang
	// scheduled_at ≤ NOW() + prep_time_minutes + buffer 5 menit → saatnya
	// diaktivasi ke pending_merchant atau auto-cancel (merchant tidak valid).
	GetScheduledFoodOrdersDue(ctx context.Context) ([]ScheduledFoodOrder, error)
	// CancelScheduledFoodOrder — FB-123: auto-cancel order terjadwal saat
	// aktivasi gagal (merchant tidak valid / lewat jam tutup). Guard status.
	CancelScheduledFoodOrder(ctx context.Context, orderID, reason string) error
	// ActivateScheduledFoodOrder — FB-123: transisi scheduled → pending_merchant
	// saat aktivasi (merchant re-validated OK). Guard status.
	ActivateScheduledFoodOrder(ctx context.Context, orderID string) error
}

type FoodQuoteService interface {
	QuoteFood(ctx context.Context, userID string, req CreateFoodOrderRequest) (*FoodQuoteResponse, error)
}

type FoodInventoryRepository interface {
	ReleaseFoodInventory(ctx context.Context, orderID string) error
}

type ScheduledFoodOrder struct {
	OrderID         string
	CustomerID      string
	OrderNumber     string
	MerchantID      string
	ScheduledAt     time.Time
	PrepTimeMinutes int
}

type FoodBatch struct {
	ID               string
	MerchantID       string
	CourierID        *string
	Status           string // forming | assigned | in_progress | completed | cancelled
	OrderAID         string
	OrderBID         *string
	DropoffDistanceM int
	MaxETAMinutes    int
	CreatedAt        time.Time
	CompletedAt      *time.Time
	UpdatedAt        time.Time
}
