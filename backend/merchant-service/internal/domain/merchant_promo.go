package domain

import (
	"context"
	"time"
)

// MerchantPromo — promo yang DIBIAYAI MERCHANT (FB-098).
// Beda dengan promo_campaigns (platform-funded): potongan ini mengurangi
// merchant_net di settlement (FB-101), BUKAN komisi PT.
type MerchantPromo struct {
	ID             string    `json:"id"`
	MerchantID     string    `json:"merchant_id"`
	MenuItemID     *string   `json:"menu_item_id,omitempty"`
	DiscountType   string    `json:"discount_type"` // percent | fixed | buy1get1
	DiscountValue  int64     `json:"discount_value"`
	MaxDiscountIDR *int64    `json:"max_discount_idr,omitempty"`
	StartsAt       time.Time `json:"starts_at"`
	EndsAt         time.Time `json:"ends_at"`
	IsActive       bool      `json:"is_active"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

// MerchantPromoRepository — CRUD self-serve promo merchant (tanpa approval admin).
type MerchantPromoRepository interface {
	Create(ctx context.Context, p *MerchantPromo) error
	GetByID(ctx context.Context, id string, merchantID string) (*MerchantPromo, error)
	// ListByMerchant list promo milik merchant (pagination, semua status).
	ListByMerchant(ctx context.Context, merchantID string, limit, offset int) ([]*MerchantPromo, int, error)
	// Update update kolom editable promo (self-serve).
	Update(ctx context.Context, p *MerchantPromo) error
	// SetActive toggle is_active (pause/resume).
	SetActive(ctx context.Context, id string, merchantID string, active bool) error
	// Delete hapus promo (hard delete, self-serve).
	Delete(ctx context.Context, id string, merchantID string) error
	// ListActiveByMerchant promo aktif yang berlaku sekarang (untuk order/checkout).
	ListActiveByMerchant(ctx context.Context, merchantID string, now time.Time) ([]*MerchantPromo, error)
}
