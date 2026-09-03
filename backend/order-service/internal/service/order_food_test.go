package service_test

import (
	"context"
	"testing"
	"time"

	"tembus/order-service/internal/domain"
	"tembus/order-service/internal/service"
)

// TestCreateFoodOrderPreservesContactlessFlag — FOOD-2026-006 backend proof:
// req.Contactless survives createFoodOrder and persists on Order.Contactless.
// Contactless orders route to photo-only PoD (no signature) on courier client.
func TestCreateFoodOrderPreservesContactlessFlag(t *testing.T) {
	ctx := context.Background()
	foodRepo := &clFoodRepo{
		merchant: &domain.FoodMerchantInfo{ID: "m-1", Name: "Warung Test", Address: "Jl Test", Lat: -6.2, Lng: 106.8, IsOpen: true, VerificationStatus: "approved"},
		item:     &domain.FoodMenuItemInfo{ID: "item-1", MerchantID: "m-1", Name: "Nasi Goreng", Price: 25000, IsAvailable: true, StockQuantity: ip(10)},
		variant:  domain.MenuItemVariant{ID: "v-1", MenuID: "item-1", Nama: "Pedas", MaxSelect: 1, MinSelect: 1, IsRequired: true, Options: []domain.MenuItemVariantOption{{ID: "v-1", VariantID: "v-1", Nama: "Pedas"}}},
	}
	pricingRepo := &MockPricingRepo{Config: &domain.PricingConfig{BaseFare: 5000, PricePerKM: 1000}}
	req := domain.CreateFoodOrderRequest{
		MerchantID: "m-1",
		Items:      []domain.FoodOrderItemRequest{{MenuID: "item-1", Quantity: 1, Variants: []domain.FoodOrderItemVariantRequest{{VariantID: "v-1", OptionID: "v-1"}}}},
		DropoffLat: -6.21, DropoffLng: 106.81, DropoffAddress: "Jl Dropoff Test, Jakarta",
		DropoffCity: "Jakarta", DropoffZipCode: "12345", ReceiverName: "Test", ReceiverPhone: "62811", Contactless: true,
		QuoteID: "quote-test-1",
	}
	fp := req
	fp.QuoteID = ""
	fp.QuoteInputFingerprint = ""
	fp.ReceiverName = ""
	fp.ReceiverPhone = ""
	fp.OrderNotes = ""
	fp.Contactless = false
	req.QuoteInputFingerprint = service.ExportTestFoodQuoteInputFingerprint(fp)
	redisRepo := &clRedisRepo{
		MockRedisRepo: &MockRedisRepo{},
		estimate: &domain.PricingEstimateResponse{
			ServiceCategory: "food", EstimateID: "quote-test-1", QuoteID: "quote-test-1",
			InputFingerprint: req.QuoteInputFingerprint, ExpiresAt: time.Now().Add(5 * time.Minute),
			DistanceFeeIDR: 5000, BasePriceIDR: 25000, DynamicPriceIDR: 25000, PlatformFeeIDR: 2500, TotalPriceIDR: 32500, DiscountIDR: 0, TaxIDR: 0,
			PriceComponents: map[string]int64{"food_subtotal_idr":25000, "delivery_fee_idr":5000, "platform_fee_idr":2500, "total_price_idr":32500},
		},
	}
	repo := &clOrderRepo{}
	svc := service.NewOrderService(repo, &stubEventRepo{}, redisRepo, pricingRepo, &stubRelay{}, &stubEventBus{}, &stubQueue{}, &stubFlags{}, &stubNotification{}, &MockConfigRepo{}, &stubLedger{}, &stubTax{})
	svc.SetFoodRepository(foodRepo)
	order, err := svc.CreateFoodOrder(ctx, "customer-1", req)
	if err != nil {
		t.Fatalf("CreateFoodOrder contactless=true err: %v", err)
	}
	if order == nil || !order.Contactless {
		t.Errorf("Order.Contactless must be true, got=%v", order != nil && order.Contactless)
	}
	req2 := req
	req2.Contactless = false
	fp2 := req2
	fp2.QuoteID = ""
	fp2.QuoteInputFingerprint = ""
	fp2.ReceiverName = ""
	fp2.ReceiverPhone = ""
	fp2.OrderNotes = ""
	fp2.Contactless = false
	req2.QuoteInputFingerprint = service.ExportTestFoodQuoteInputFingerprint(fp2)
	o2, _ := svc.CreateFoodOrder(ctx, "customer-2", req2)
	if o2 != nil && o2.Contactless {
		t.Errorf("Order.Contactless must be false")
	}
}

// Helper constructors
func ip(i int) *int { return &i }

type clFoodRepo struct {
	domain.FoodRepository
	merchant *domain.FoodMerchantInfo
	item     *domain.FoodMenuItemInfo
	variant  domain.MenuItemVariant
}

func (m *clFoodRepo) GetFoodMerchant(ctx context.Context, id string) (*domain.FoodMerchantInfo, error) {
	return m.merchant, nil
}
func (m *clFoodRepo) GetFoodMenuItems(ctx context.Context, menuIDs []string) ([]domain.FoodMenuItemInfo, error) {
	return []domain.FoodMenuItemInfo{*m.item}, nil
}
func (m *clFoodRepo) GetMenuItemVariants(ctx context.Context, ids []string) (map[string][]domain.MenuItemVariant, error) {
	return map[string][]domain.MenuItemVariant{"item-1": {m.variant}}, nil
}
func (m *clFoodRepo) CreateFoodOrderWithItems(ctx context.Context, o *domain.Order, items []domain.FoodOrderItem) error {
	return nil
}

type clOrderRepo struct {
	domain.OrderRepository
	captured *domain.Order
}

func (r *clOrderRepo) Create(ctx context.Context, o *domain.Order) error {
	r.captured = o
	return nil
}

type clRedisRepo struct {
	*MockRedisRepo
	estimate *domain.PricingEstimateResponse
}

func (r *clRedisRepo) GetEstimate(ctx context.Context, estimateID string) (*domain.PricingEstimateResponse, error) {
	if r.estimate != nil {
		return r.estimate, nil
	}
	return r.MockRedisRepo.GetEstimate(ctx, estimateID)
}
