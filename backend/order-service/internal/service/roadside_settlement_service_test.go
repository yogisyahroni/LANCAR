package service

import (
	"context"
	"errors"
	"testing"
	"tembus/order-service/internal/domain"
)

type fakeRoadsideSettlementSourceRepo struct {
	source *domain.RoadsideSettlementSource
	err    error
}

func (f fakeRoadsideSettlementSourceRepo) GetRoadsideSettlementSource(context.Context, string) (*domain.RoadsideSettlementSource, error) {
	return f.source, f.err
}

type fakeSettlementConfigRepo struct {
	config *domain.SettlementConfig
	err    error
}

func (f fakeSettlementConfigRepo) GetSettlementConfig(context.Context, string) (*domain.SettlementConfig, error) {
	return f.config, f.err
}
func (f fakeSettlementConfigRepo) GetAllSettlementConfigs(context.Context) ([]*domain.SettlementConfig, error) {
	if f.config == nil {
		return nil, f.err
	}
	return []*domain.SettlementConfig{f.config}, f.err
}

func validRoadsideSettlementSource() *domain.RoadsideSettlementSource {
	return &domain.RoadsideSettlementSource{
		OrderID:           "order-1",
		ServiceCode:       "tambal_ban_motor",
		ServiceSubType:    "tambal_ban_motor",
		Status:            domain.StatusDelivered,
		AssignedCourierID: "courier-1",
		GrossTotalIDR:     120_000,
		BaseFareIDR:       50_000,
		DistanceFeeIDR:    20_000,
		InsuranceFeeIDR:   5_000,
		FinalReportReady:  true,
	}
}

func validSettlementConfig() *domain.SettlementConfig {
	return &domain.SettlementConfig{
		ServiceCode:           "tambal_ban_motor",
		CommissionBasis:       domain.SettlementBasisPerKM,
		PlatformCommissionPct: 20,
		MDRPct:                1,
		TaxPct:                1,
		CourierKeepsBaseFee:   true,
	}
}

func TestRoadsideSettlementRequiresFinalProof(t *testing.T) {
	source := validRoadsideSettlementSource()
	source.FinalReportReady = false
	svc := NewRoadsideSettlementService(fakeRoadsideSettlementSourceRepo{source: source}, fakeSettlementConfigRepo{config: validSettlementConfig()})

	_, err := svc.Calculate(context.Background(), "order-1", "courier-1", "courier")
	if !errors.Is(err, domain.ErrRoadsideSettlementProofRequired) {
		t.Fatalf("expected proof required, got %v", err)
	}
}

func TestRoadsideSettlementRequiresDeliveredOrder(t *testing.T) {
	source := validRoadsideSettlementSource()
	source.Status = domain.StatusDelivering
	svc := NewRoadsideSettlementService(fakeRoadsideSettlementSourceRepo{source: source}, fakeSettlementConfigRepo{config: validSettlementConfig()})

	_, err := svc.Calculate(context.Background(), "order-1", "courier-1", "courier")
	if !errors.Is(err, domain.ErrRoadsideSettlementNotDelivered) {
		t.Fatalf("expected delivered gate, got %v", err)
	}
}

func TestRoadsideSettlementRejectsOtherCourier(t *testing.T) {
	svc := NewRoadsideSettlementService(fakeRoadsideSettlementSourceRepo{source: validRoadsideSettlementSource()}, fakeSettlementConfigRepo{config: validSettlementConfig()})

	_, err := svc.Calculate(context.Background(), "order-1", "courier-2", "courier")
	if !errors.Is(err, domain.ErrForbidden) {
		t.Fatalf("expected forbidden, got %v", err)
	}
}

func TestRoadsideSettlementUsesAuthoritativeFrozenAmounts(t *testing.T) {
	svc := NewRoadsideSettlementService(fakeRoadsideSettlementSourceRepo{source: validRoadsideSettlementSource()}, fakeSettlementConfigRepo{config: validSettlementConfig()})

	result, err := svc.Calculate(context.Background(), "order-1", "courier-1", "courier")
	if err != nil {
		t.Fatalf("calculate: %v", err)
	}
	if result.GrossTotal != 120_000 {
		t.Fatalf("gross total = %d", result.GrossTotal)
	}
	if result.PerKMRevenue != 20_000 || result.BaseFareRevenue != 50_000 {
		t.Fatalf("unexpected travel revenue: base=%d distance=%d", result.BaseFareRevenue, result.PerKMRevenue)
	}
	if result.PlatformCommissionAmt != 14_000 {
		t.Fatalf("commission = %d, want 14000", result.PlatformCommissionAmt)
	}
	// 120000 - 1200 MDR - 1200 tax - 5000 insurance - 14000 commission.
	if result.EstimatedNetEarnings != 98_600 {
		t.Fatalf("net = %d, want 98600", result.EstimatedNetEarnings)
	}
}
