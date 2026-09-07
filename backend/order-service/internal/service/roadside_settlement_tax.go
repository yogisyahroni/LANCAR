package service

import (
	"context"
	"fmt"
	"tembus/order-service/internal/domain"
)

type roadsideSettlementTaxPolicy struct {
	taxRepo    domain.TaxRepository
	configRepo domain.ConfigRepository
}

func NewRoadsideSettlementTaxPolicy(taxRepo domain.TaxRepository, configRepo domain.ConfigRepository) domain.RoadsideSettlementTaxPolicy {
	return &roadsideSettlementTaxPolicy{taxRepo: taxRepo, configRepo: configRepo}
}

// Use the existing configured courier withholding policy, but never assume a
// missing NPWP lookup or invalid rate means zero withholding.
func (p *roadsideSettlementTaxPolicy) CalculateWithholding(ctx context.Context, courierID string, netIDR int64) (int64, error) {
	if p.taxRepo == nil || p.configRepo == nil {
		return 0, fmt.Errorf("withholding configuration unavailable")
	}
	hasNPWP, err := p.taxRepo.HasNPWP(ctx, courierID)
	if err != nil {
		return 0, fmt.Errorf("verify courier tax profile: %w", err)
	}
	key, defaultRate := "PPH21_COURIER_RATE_NON_NPWP", 3.0
	if hasNPWP {
		key, defaultRate = "PPH21_COURIER_RATE_NPWP", 2.5
	}
	return domain.RoadsidePercent(netIDR, p.configRepo.GetFloatConfig(ctx, key, defaultRate))
}

// CalculateWithholdingFromRate uses the immutable rate selected by the finalizer.
// It never performs a second, potentially stale configuration lookup.
func (p *roadsideSettlementTaxPolicy) CalculateWithholdingFromRate(netIDR int64, ratePct float64) (int64, error) {
	return domain.RoadsidePercent(netIDR, ratePct)
}
