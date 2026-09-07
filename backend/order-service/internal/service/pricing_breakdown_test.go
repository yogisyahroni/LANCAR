package service

import (
	"context"
	"encoding/json"
	"testing"

	"tembus/order-service/internal/domain"
)

type pricingBreakdownConfigStub struct {
	labels json.RawMessage
}

func (s pricingBreakdownConfigStub) GetConfig(context.Context, string) (*domain.SystemConfig, error) {
	return &domain.SystemConfig{Value: s.labels}, nil
}
func (pricingBreakdownConfigStub) GetFloatConfig(context.Context, string, float64) float64 { return 0 }
func (pricingBreakdownConfigStub) GetIntConfig(context.Context, string, int) int           { return 0 }
func (pricingBreakdownConfigStub) GetStringConfig(_ context.Context, _, fallback string) string {
	return fallback
}

func TestBuildPricingBreakdownUsesMarketLabelsWithoutChangingSemantics(t *testing.T) {
	config := pricingBreakdownConfigStub{labels: json.RawMessage(`{"delivery_fee":"Ongkos antar Jakarta"}`)}
	breakdown, err := buildPricingBreakdown(context.Background(), config, "food_delivery", "jakarta", "marketplace-pricing-2026-v1", []domain.PricingComponent{
		pricingComponent("item_subtotal", domain.PricingComponentCustomerCharge, 100000, true),
		pricingComponent("delivery_fee", domain.PricingComponentCustomerCharge, 20000, true),
		pricingComponent("merchant_gross", domain.PricingComponentMerchantGross, 100000, false),
		pricingComponent("merchant_commission", domain.PricingComponentMerchantCommission, 15000, false),
		pricingComponent("courier_earning", domain.PricingComponentCourierEarning, 17000, false),
	})
	if err != nil {
		t.Fatalf("build breakdown: %v", err)
	}
	if breakdown.ComponentLabels["delivery_fee"] != "Ongkos antar Jakarta" {
		t.Fatalf("market label was not loaded: %+v", breakdown.ComponentLabels)
	}
	if breakdown.CustomerTotalIDR != 120000 || breakdown.MerchantPayableIDR != 85000 || breakdown.PlatformAmountIDR != 18000 {
		t.Fatalf("financial semantics changed with label override: %+v", breakdown)
	}
	if err := breakdown.Validate(); err != nil {
		t.Fatalf("breakdown should remain valid: %v", err)
	}
}
