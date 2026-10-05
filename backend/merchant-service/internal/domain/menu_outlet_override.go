package domain

import (
	"context"
	"time"
)

// MenuItemOutletOverride is the effective policy for one menu item in one
// outlet. Base* values are the canonical catalog values; effective* values are
// what customer discovery and checkout must use.
type MenuItemOutletOverride struct {
	ID                   string    `json:"id,omitempty"`
	MerchantID           string    `json:"merchant_id"`
	MenuItemID           string    `json:"menu_item_id"`
	BranchID             string    `json:"branch_id"`
	BranchCode           string    `json:"branch_code,omitempty"`
	BranchName           string    `json:"branch_name,omitempty"`
	BasePriceIDR         int64     `json:"base_price_idr"`
	EffectivePriceIDR    int64     `json:"effective_price_idr"`
	PriceIDR             *int64    `json:"price_idr,omitempty"`
	BaseIsAvailable      bool      `json:"base_is_available"`
	EffectiveIsAvailable bool      `json:"effective_is_available"`
	IsAvailable          *bool     `json:"is_available,omitempty"`
	PromoID              *string   `json:"promo_id,omitempty"`
	Version              int64     `json:"version"`
	UpdatedBy            string    `json:"updated_by"`
	CreatedAt            time.Time `json:"created_at"`
	UpdatedAt            time.Time `json:"updated_at"`
}

type UpsertMenuItemOutletOverrideRequest struct {
	MenuItemID      string  `json:"menu_item_id"`
	BranchID        string  `json:"branch_id"`
	PriceIDR        *int64  `json:"price_idr"`
	IsAvailable     *bool   `json:"is_available"`
	PromoID         *string `json:"promo_id"`
	ExpectedVersion *int64  `json:"expected_version,omitempty"`
}

// MenuItemOutletOverrideRepository is a capability interface so existing
// merchant repository test doubles do not need to implement this new feature.
type MenuItemOutletOverrideRepository interface {
	ListMenuItemOutletOverrides(ctx context.Context, merchantID, menuItemID, branchID string) ([]*MenuItemOutletOverride, error)
	UpsertMenuItemOutletOverride(ctx context.Context, override *MenuItemOutletOverride, idempotencyKey, requestFingerprint string) (*MenuItemOutletOverride, bool, error)
}

// MenuOutletOverrideService is intentionally narrower than MerchantService;
// adding a capability must not break older service mocks.
type MenuOutletOverrideService interface {
	ListMenuItemOutletOverrides(ctx context.Context, userID, menuItemID, branchID string) ([]*MenuItemOutletOverride, error)
	UpsertMenuItemOutletOverride(ctx context.Context, userID string, req UpsertMenuItemOutletOverrideRequest, idempotencyKey string) (*MenuItemOutletOverride, bool, error)
}
