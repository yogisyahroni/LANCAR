package service

import (
	"context"
	"testing"

	"tembus/order-service/internal/domain"
)

type quoteValidationAWBStub struct{}

func (quoteValidationAWBStub) CheckTariff(context.Context, domain.CheckTariffRequest) (*domain.CheckTariffResponse, error) {
	return &domain.CheckTariffResponse{}, nil
}

func (quoteValidationAWBStub) CreateAWB(context.Context, domain.AWBRequest) (*domain.AWBResponse, error) {
	return nil, nil
}

func (quoteValidationAWBStub) SendWhatsApp(context.Context, string, string) error { return nil }

func TestChargeableWeightKgUsesActualWeightWhenHigher(t *testing.T) {
	if got := chargeableWeightKg(2, 10, 10, 10); got != 2 {
		t.Fatalf("expected actual weight 2kg, got %v", got)
	}
}

func TestChargeableWeightKgUsesVolumetricWeightWhenHigher(t *testing.T) {
	if got := chargeableWeightKg(1, 30, 40, 50); got != 10 {
		t.Fatalf("expected volumetric weight 10kg, got %v", got)
	}
}

func TestChargeableWeightKgIgnoresIncompleteDimensions(t *testing.T) {
	if got := chargeableWeightKg(1, 30, 0, 50); got != 1 {
		t.Fatalf("expected actual weight for incomplete dimensions, got %v", got)
	}
}

func TestNormalizeAggregatorCategoryIsStable(t *testing.T) {
	if got := normalizeAggregatorCategory("  Makanan   Beku "); got != "makanan-beku" {
		t.Fatalf("expected normalized category makanan-beku, got %q", got)
	}
}

func TestAggregatorQuoteRejectsMissingProviderAreaCodes(t *testing.T) {
	service := &paymentLinkServiceImpl{awbClient: quoteValidationAWBStub{}}
	if _, err := service.Quote(context.Background(), domain.CheckTariffRequest{
		Provider: "jne", WeightKG: 1,
	}); err == nil {
		t.Fatal("expected missing provider area codes to be rejected")
	}
}
