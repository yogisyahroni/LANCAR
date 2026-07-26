package service

import (
	"context"
	"fmt"
	"tembus/order-service/internal/domain"
)

type settlementServiceImpl struct {
	repo domain.SettlementRepository
}

func NewSettlementService(repo domain.SettlementRepository) domain.SettlementService {
	return &settlementServiceImpl{repo: repo}
}

// CalculateSettlement computes the dual-model settlement:
// - Model A (Pool): Commission = 20% of entire Operational Pool (Ondemand/Regular)
// - Model B (Per-KM): Commission = 20% of (BaseFare + PerKM * Distance) (Tambal Ban/Towing)
func (s *settlementServiceImpl) CalculateSettlement(
	ctx context.Context,
	orderID, serviceCode string,
	grossTotal, distanceKM, baseFare, perKMRate, courierServicePrice, tollCost, insuranceFee int64,
) (*domain.SettlementResult, error) {
	config, err := s.repo.GetSettlementConfig(ctx, serviceCode)
	if err != nil {
		return nil, fmt.Errorf("settlement config not found for %s: %w", serviceCode, err)
	}

	// MDR and PPN are paid by customer, deducted from gross
	mdrAmount := int64(float64(grossTotal) * config.MDRPct / 100.0)
	taxAmount := int64(float64(grossTotal) * config.TaxPct / 100.0)
	operationalPool := grossTotal - mdrAmount - taxAmount - insuranceFee

	// Per-km revenue = BaseFare + (PerKM * Distance)
	perKMRevenue := int64(float64(perKMRate) * distanceKM)
	baseFareRevenue := baseFare
	totalTravelRevenue := baseFareRevenue + perKMRevenue

	// Commission calculation based on model
	var platformCommission int64
	switch config.CommissionBasis {
	case domain.SettlementBasisPool:
		// Model A: Commission from entire pool
		platformCommission = int64(float64(operationalPool) * config.PlatformCommissionPct / 100.0)

	case domain.SettlementBasisPerKM:
		// Model B: Commission only from travel revenue (BaseFare + PerKM)
		platformCommission = int64(float64(totalTravelRevenue) * config.PlatformCommissionPct / 100.0)

	default:
		return nil, fmt.Errorf("unknown commission basis: %s", config.CommissionBasis)
	}

	// Courier earnings
	courierPerKMEarning := perKMRevenue
	if config.CommissionBasis == domain.SettlementBasisPerKM {
		courierPerKMEarning = perKMRevenue - int64(float64(perKMRevenue)*config.PlatformCommissionPct/100.0)
	}

	courierBaseFee := baseFareRevenue
	if !config.CourierKeepsBaseFee && config.CommissionBasis == domain.SettlementBasisPerKM {
		courierBaseFee = baseFareRevenue - int64(float64(baseFareRevenue)*config.PlatformCommissionPct/100.0)
	}

	courierToll := int64(0)
	if config.CourierKeepsToll {
		courierToll = tollCost
	}

	netEarnings := operationalPool - platformCommission

	return &domain.SettlementResult{
		GrossTotal:              grossTotal,
		MDRAmount:               mdrAmount,
		TaxAmount:               taxAmount,
		InsuranceFee:            insuranceFee,
		OperationalPool:         operationalPool,
		CommissionBasis:         string(config.CommissionBasis),
		PerKMRevenue:            perKMRevenue,
		BaseFareRevenue:         baseFareRevenue,
		PlatformCommissionPct:   config.PlatformCommissionPct,
		PlatformCommissionAmt:   platformCommission,
		CourierServiceFee:       courierServicePrice,
		CourierBaseFee:          courierBaseFee,
		CourierTollReimburse:    courierToll,
		CourierPerKMEarning:     courierPerKMEarning,
		EstimatedNetEarnings:    netEarnings,
		SettlementModel:         string(config.CommissionBasis),
		AppliesToService:        []string{serviceCode},
	}, nil
}

func (s *settlementServiceImpl) GetSettlementConfig(ctx context.Context, serviceCode string) (*domain.SettlementConfig, error) {
	return s.repo.GetSettlementConfig(ctx, serviceCode)
}
