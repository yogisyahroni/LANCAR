package domain_test

import (
	"testing"

	"tembus/order-service/internal/domain"
)

func TestPricingBreakdownReconcilesExplicitStakeholderComponents(t *testing.T) {
	breakdown := domain.PricingBreakdown{
		PolicyVersion: "marketplace-pricing-2026-v1",
		Currency:      "IDR",
		Market:        "jakarta",
		ServiceCode:   "food_delivery",
		Components: []domain.PricingComponent{
			{Code: "item_subtotal", AmountIDR: 100000, Kind: domain.PricingComponentCustomerCharge},
			{Code: "delivery_fee", AmountIDR: 20000, Kind: domain.PricingComponentCustomerCharge},
			{Code: "platform_fee", AmountIDR: 10000, Kind: domain.PricingComponentCustomerCharge},
			{Code: "tax", AmountIDR: 14300, Kind: domain.PricingComponentCustomerCharge},
			{Code: "membership_subsidy", AmountIDR: 5000, Kind: domain.PricingComponentCustomerDiscount},
			{Code: "promo_discount", AmountIDR: 10000, Kind: domain.PricingComponentCustomerDiscount},
			{Code: "merchant_gross", AmountIDR: 100000, Kind: domain.PricingComponentMerchantGross},
			{Code: "merchant_commission", AmountIDR: 2500, Kind: domain.PricingComponentMerchantCommission},
			{Code: "courier_earning", AmountIDR: 17000, Kind: domain.PricingComponentCourierEarning},
		},
	}

	reconciled, err := breakdown.Recalculate()
	if err != nil {
		t.Fatalf("recalculate: %v", err)
	}
	if reconciled.CustomerTotalIDR != 129300 || reconciled.MerchantPayableIDR != 97500 || reconciled.PlatformAmountIDR != 14800 {
		t.Fatalf("unexpected reconciliation: %+v", reconciled)
	}
	if err := reconciled.Validate(); err != nil {
		t.Fatalf("validated breakdown rejected: %v", err)
	}

	reconciled.PlatformAmountIDR++
	if err := reconciled.Validate(); err == nil {
		t.Fatal("tampered platform amount must fail validation")
	}
}

func TestPricingBreakdownRejectsDuplicateOrNegativeComponents(t *testing.T) {
	base := domain.PricingBreakdown{PolicyVersion: "v1", Currency: "IDR", ServiceCode: "p2p"}
	base.Components = []domain.PricingComponent{
		{Code: "base_fare", AmountIDR: 1000, Kind: domain.PricingComponentCustomerCharge},
		{Code: "base_fare", AmountIDR: 1000, Kind: domain.PricingComponentCustomerCharge},
	}
	if _, err := base.Recalculate(); err == nil {
		t.Fatal("duplicate component must fail")
	}
	base.Components = []domain.PricingComponent{{Code: "rounding_adjustment", AmountIDR: -1, Kind: domain.PricingComponentCustomerAdjustment}}
	if _, err := base.Recalculate(); err == nil {
		t.Fatal("negative adjustment without a positive customer total must fail reconciliation")
	}
}
