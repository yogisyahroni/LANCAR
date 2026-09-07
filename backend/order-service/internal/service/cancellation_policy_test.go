package service

import (
	"testing"

	"tembus/order-service/internal/domain"
)

func TestCancellationDecisionFoodUsesMarketAndOperationalCost(t *testing.T) {
	merchantID := "merchant-1"
	order := &domain.Order{
		ServiceSubType:  "food_delivery",
		MerchantID:      &merchantID,
		PricingSnapshot: `{"market":"ID-JK","platform_fee_idr":3000}`,
	}

	free := cancellationDecision(order, domain.StatusSearching, false)
	if free.PolicyVersion != "food-cancellation-ID-JK-v1" || free.RefundRatio != 1 || free.WithholdServiceFee {
		t.Fatalf("expected free ID-JK food cancellation, got %+v", free)
	}

	charged := cancellationDecision(order, domain.StatusSearching, true)
	if charged.PolicyVersion != "food-cancellation-ID-JK-v1" || charged.RefundRatio != 1 || !charged.WithholdServiceFee {
		t.Fatalf("expected assigned courier fee, got %+v", charged)
	}
}

func TestCancellationDecisionFoodRejectsAfterPickup(t *testing.T) {
	merchantID := "merchant-1"
	order := &domain.Order{ServiceSubType: "food_delivery", MerchantID: &merchantID, PricingSnapshot: `{}`}
	decision := cancellationDecision(order, domain.StatusPickedUp, true)
	if decision.RefundRatio != 0 || decision.WithholdServiceFee || decision.FeeReason == "" {
		t.Fatalf("expected no customer refund after pickup, got %+v", decision)
	}
}
