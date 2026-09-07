package domain

import (
	"context"
	"fmt"
	"strings"
)

const (
	FoodBundleOpen    = "open"
	FoodBundleFinal   = "finalized"
	FoodBundleSettled = "settled"
)

type FoodMultiStoreBundle struct {
	ID          string                `json:"id"`
	CustomerID  string                `json:"customer_id"`
	Status      string                `json:"status"`
	MerchantIDs []string              `json:"merchant_ids"`
	OrderIDs    []string              `json:"order_ids"`
	Settlement  *FoodBundleSettlement `json:"settlement,omitempty"`
}

type CreateFoodMultiStoreBundleRequest struct {
	MerchantIDs []string `json:"merchant_ids" validate:"required,min=2,max=5"`
}

type FoodBundleSettlement struct {
	BundleID        string `json:"bundle_id"`
	GrossTotalIDR   int64  `json:"gross_total_idr"`
	ChildOrderCount int    `json:"child_order_count"`
	Status          string `json:"status"` // pending | reconciled
}

type FoodBundleRepository interface {
	CreateFoodBundle(ctx context.Context, bundle *FoodMultiStoreBundle) error
	GetFoodBundle(ctx context.Context, bundleID string) (*FoodMultiStoreBundle, error)
	AttachFoodBundleOrder(ctx context.Context, bundleID, orderID, merchantID string) error
	FinalizeFoodBundle(ctx context.Context, bundleID, customerID string, settlement FoodBundleSettlement) error
}

type FoodBundleService interface {
	CreateBundle(ctx context.Context, customerID string, req CreateFoodMultiStoreBundleRequest) (*FoodMultiStoreBundle, error)
	GetBundle(ctx context.Context, customerID, bundleID string) (*FoodMultiStoreBundle, error)
	AttachOrder(ctx context.Context, customerID, bundleID, orderID string) error
	FinalizeBundle(ctx context.Context, customerID, bundleID string) (*FoodMultiStoreBundle, error)
}

func ValidateFoodMultiStoreMerchants(merchantIDs []string) error {
	if len(merchantIDs) < 2 || len(merchantIDs) > 5 {
		return fmt.Errorf("multi-store bundle must contain 2 to 5 merchants")
	}
	seen := make(map[string]struct{}, len(merchantIDs))
	for _, id := range merchantIDs {
		id = strings.TrimSpace(id)
		if id == "" {
			return fmt.Errorf("merchant id cannot be empty")
		}
		if _, ok := seen[id]; ok {
			return fmt.Errorf("merchant cannot appear twice in a bundle")
		}
		seen[id] = struct{}{}
	}
	return nil
}
