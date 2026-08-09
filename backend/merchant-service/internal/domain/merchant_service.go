package domain

import "context"

// MerchantOrderView — tampilan order food untuk merchant (ringkasan + items).
type MerchantOrderView struct {
	ID                string  `json:"id"`
	OrderNumber       string  `json:"order_number"`
	Status            string  `json:"status"`
	CustomerName      string  `json:"customer_name,omitempty"`
	CustomerPhone     string  `json:"customer_phone,omitempty"`
	DropoffAddress    string  `json:"dropoff_address,omitempty"`
	TotalPriceIDR     int64   `json:"total_price_idr"`
	DistanceKM        float64 `json:"distance_km"`
	MerchantAcceptedAt *string `json:"merchant_accepted_at,omitempty"`
	FoodReadyAt       *string `json:"food_ready_at,omitempty"`
	CreatedAt         string  `json:"created_at"`
	Items             []FoodOrderItemView `json:"items"`
}

// FoodOrderItemView — item dalam order food (dari food_order_items snapshot).
type FoodOrderItemView struct {
	ItemName  string `json:"item_name"`
	Quantity  int    `json:"quantity"`
	ItemPrice int64  `json:"item_price"`
	Subtotal  int64  `json:"subtotal"`
	Notes     string `json:"notes,omitempty"`
}

// MerchantService — interface layanan merchant (FOOD-BIKE-017).
type MerchantService interface {
	// Register mendaftarkan merchant baru (status pending) + dokumen verifikasi.
	Register(ctx context.Context, userID string, req RegisterMerchantRequest) (*Merchant, error)
	// GetProfile ambil profil merchant milik user (nil jika belum daftar).
	GetProfile(ctx context.Context, userID string) (*Merchant, error)
	// UpdateProfile update profil merchant milik user.
	UpdateProfile(ctx context.Context, userID string, req UpdateMerchantRequest) (*Merchant, error)
	// ToggleOpen buka/tutup merchant (hanya jika approved).
	ToggleOpen(ctx context.Context, userID string, isOpen bool) (*Merchant, error)
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
	ListMenuItems(ctx context.Context, userID string, page, pageSize int) ([]*MenuItem, int, error)

	// Order action (FOOD-BIKE-017/021)
	// AcceptOrder menyetujui order food: status → preparing, set merchant_accepted_at.
	AcceptOrder(ctx context.Context, userID string, orderID string) error
	// RejectOrder menolak order food: status → cancelled_by_merchant + reason.
	// FB-122: rejectReason enum terstruktur (stok_habis/terlalu_sibuk/
	// tutup_mendadak/lainnya) untuk analitik.
	RejectOrder(ctx context.Context, userID string, orderID string, reason string, rejectReason string) error
	// ListOrders list order food milik merchant (belum dikerjakan / riwayat).
	ListOrders(ctx context.Context, userID string, status string, page, pageSize int) ([]*MerchantOrderView, int, error)
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

	// Edit order (FB-087)
	// EditOrderItems mengubah item order food sebelum konfirmasi merchant.
	// Berlaku hanya status pending_merchant; nilai baru TIDAK boleh melebihi
	// nilai order awal (Grab pattern). Notif push otomatis ke customer.
	EditOrderItems(ctx context.Context, userID, orderID string, req EditOrderItemsRequest) (*EditOrderResult, error)
}
