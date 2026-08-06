package domain

import (
	"context"
	"time"
)

// MenuItem — menu item merchant (FOOD-BIKE-004/016).
// Harga BIGINT (IDR, tanpa desimal) — konsisten dengan skema harga LANCAR.
type MenuItem struct {
	ID              string    `json:"id"`
	MerchantID      string    `json:"merchant_id"`
	Nama            string    `json:"nama"`
	Harga           int64     `json:"harga"`
	Foto            *string   `json:"foto,omitempty"`
	Kategori        string    `json:"kategori"`
	PrepTimeMinutes int       `json:"prep_time_minutes"`
	IsAvailable     bool      `json:"is_available"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
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
	// Delete hapus menu item (soft-delete via status, atau hard delete).
	Delete(ctx context.Context, id string, merchantID string) error
	// CountByMerchant total menu (pagination).
	CountByMerchant(ctx context.Context, merchantID string) (int, error)
}
