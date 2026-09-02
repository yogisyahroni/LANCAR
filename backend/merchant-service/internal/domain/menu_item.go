package domain

import (
	"context"
	"time"
)

// MenuItem — menu item merchant (FOOD-BIKE-004/016).
// Harga BIGINT (IDR, tanpa desimal) — konsisten dengan skema harga LANCAR.
type MenuItem struct {
	ID              string     `json:"id"`
	MerchantID      string     `json:"merchant_id"`
	Nama            string     `json:"nama"`
	Harga           int64      `json:"harga"`
	Foto            *string    `json:"foto,omitempty"`
	Deskripsi       *string    `json:"deskripsi,omitempty"`
	Kategori        string     `json:"kategori"`
	PrepTimeMinutes int        `json:"prep_time_minutes"`
	IsAvailable     bool       `json:"is_available"`
	StockQuantity   *int       `json:"stock_quantity,omitempty"`
	DailySalesLimit *int       `json:"daily_sales_limit,omitempty"`
	DailySalesCount int        `json:"daily_sales_count"`
	SalesResetAt    *time.Time `json:"sales_limit_reset_at,omitempty"`
	CreatedAt       time.Time  `json:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at"`
}

// MenuItemRepository — interface CRUD menu merchant.
type MenuItemRepository interface {
	Create(ctx context.Context, item *MenuItem) error
	GetByID(ctx context.Context, id string) (*MenuItem, error)
	// ListByMerchant list menu milik merchant (pagination).
	ListByMerchant(ctx context.Context, merchantID string, limit, offset int) ([]*MenuItem, error)
	// Update update nama/harga/foto/kategori/prep_time/is_available.
	Update(ctx context.Context, item *MenuItem) error
	// SetAvailability toggle is_available (habis/masuk stok).
	SetAvailability(ctx context.Context, id string, merchantID string, available bool) error
	UpdateInventory(ctx context.Context, id string, merchantID string, stockQuantity *int, dailySalesLimit *int, resetAt *time.Time) error
	// Delete hapus menu item (soft-delete via status, atau hard delete).
	Delete(ctx context.Context, id string, merchantID string) error
	// CountByMerchant total menu (pagination).
	CountByMerchant(ctx context.Context, merchantID string) (int, error)
	// GetVariantsByMenuItem — FB-108: grup varian + opsi milik menu item.
	GetVariantsByMenuItem(ctx context.Context, menuItemID, merchantID string) ([]*MenuItemVariant, error)
	// ReplaceVariants — FB-108: replace SEMUA varian menu item dalam SATU
	// transaksi (hapus lama + insert baru). Dipakai editor varian mobile.
	ReplaceVariants(ctx context.Context, menuItemID, merchantID string, variants []*MenuItemVariant) error
}

// MenuItemVariant — grup varian menu (Ukuran, Level Pedas, Tambahan...).
type MenuItemVariant struct {
	ID         string                  `json:"id"`
	MenuItemID string                  `json:"menu_item_id"`
	Nama       string                  `json:"nama"`
	IsRequired bool                    `json:"is_required"`
	MinSelect  int                     `json:"min_select"`
	MaxSelect  int                     `json:"max_select"`
	SortOrder  int                     `json:"sort_order"`
	Options    []MenuItemVariantOption `json:"options"`
}

// MenuItemVariantOption — satu opsi dalam grup varian (harga delta IDR).
type MenuItemVariantOption struct {
	ID         string `json:"id"`
	VariantID  string `json:"variant_id"`
	Nama       string `json:"nama"`
	PriceDelta int64  `json:"price_delta"`
	IsDefault  bool   `json:"is_default"`
}
