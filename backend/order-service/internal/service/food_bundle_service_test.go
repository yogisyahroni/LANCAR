package service

import (
	"context"
	"tembus/order-service/internal/domain"
	"testing"
)

type fakeBundleRepo struct{ bundle *domain.FoodMultiStoreBundle }

func (r *fakeBundleRepo) CreateFoodBundle(_ context.Context, b *domain.FoodMultiStoreBundle) error {
	r.bundle = b
	return nil
}
func (r *fakeBundleRepo) GetFoodBundle(context.Context, string) (*domain.FoodMultiStoreBundle, error) {
	return r.bundle, nil
}
func (r *fakeBundleRepo) AttachFoodBundleOrder(_ context.Context, _, orderID, merchantID string) error {
	r.bundle.OrderIDs = append(r.bundle.OrderIDs, orderID)
	for i, id := range r.bundle.MerchantIDs {
		if id == merchantID {
			_ = i
		}
	}
	return nil
}
func (r *fakeBundleRepo) FinalizeFoodBundle(context.Context, string, string, domain.FoodBundleSettlement) error {
	r.bundle.Status = domain.FoodBundleFinal
	return nil
}

type fakeBundleOrderRepo struct{ orders map[string]*domain.Order }

func (r *fakeBundleOrderRepo) GetByID(_ context.Context, id string) (*domain.Order, error) {
	return r.orders[id], nil
}

func TestFoodBundleServicePreservesIndependentChildTotals(t *testing.T) {
	repo := &fakeBundleRepo{}
	orderRepo := &fakeBundleOrderRepo{orders: map[string]*domain.Order{
		"order-a": {ID: "order-a", CustomerID: "customer", ServiceSubType: "food_delivery", MerchantID: stringPtr("merchant-a"), TotalPriceIDR: 10000},
		"order-b": {ID: "order-b", CustomerID: "customer", ServiceSubType: "food_delivery", MerchantID: stringPtr("merchant-b"), TotalPriceIDR: 15000},
	}}
	svc := NewFoodBundleService(repo, orderRepo, nil)
	bundle, err := svc.CreateBundle(context.Background(), "customer", domain.CreateFoodMultiStoreBundleRequest{MerchantIDs: []string{"merchant-a", "merchant-b"}})
	if err != nil {
		t.Fatal(err)
	}
	if err = svc.AttachOrder(context.Background(), "customer", bundle.ID, "order-a"); err != nil {
		t.Fatal(err)
	}
	if err = svc.AttachOrder(context.Background(), "customer", bundle.ID, "order-b"); err != nil {
		t.Fatal(err)
	}
	finalized, err := svc.FinalizeBundle(context.Background(), "customer", bundle.ID)
	if err != nil {
		t.Fatal(err)
	}
	if finalized.Settlement == nil || finalized.Settlement.GrossTotalIDR != 25000 || finalized.Settlement.ChildOrderCount != 2 {
		t.Fatalf("unexpected settlement: %+v", finalized.Settlement)
	}
}
