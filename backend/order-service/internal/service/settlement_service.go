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
	grossTotal int64, distanceKM float64, baseFare, perKMRate, courierServicePrice, tollCost, insuranceFee int64,
) (*domain.SettlementResult, error) {
	config, err := s.repo.GetSettlementConfig(ctx, serviceCode)
	if err != nil {
		return nil, fmt.Errorf("settlement config not found for %s: %w", serviceCode, err)
	}

	// MDR and PPN are paid by customer, deducted from gross
	mdrMoney, err := domain.LegacyIDR(grossTotal).MultiplyPercent(config.MDRPct)
	if err != nil {
		return nil, fmt.Errorf("calculate settlement MDR: %w", err)
	}
	mdrAmount := mdrMoney.AmountMinor
	taxMoney, err := domain.LegacyIDR(grossTotal).MultiplyPercent(config.TaxPct)
	if err != nil {
		return nil, fmt.Errorf("calculate settlement tax: %w", err)
	}
	taxAmount := taxMoney.AmountMinor
	operationalPool := grossTotal - mdrAmount - taxAmount - insuranceFee

	// Per-km revenue = BaseFare + (PerKM * Distance)
	perKMMoney, err := domain.LegacyIDR(perKMRate).MultiplyFloatRate(distanceKM)
	if err != nil {
		return nil, fmt.Errorf("calculate settlement distance revenue: %w", err)
	}
	perKMRevenue := perKMMoney.AmountMinor
	baseFareRevenue := baseFare
	totalTravelRevenue := baseFareRevenue + perKMRevenue

	// Commission calculation based on model
	var platformCommission int64
	switch config.CommissionBasis {
	case domain.SettlementBasisPool:
		// Model A: Commission from entire pool
		commissionMoney, commissionErr := domain.LegacyIDR(operationalPool).MultiplyPercent(config.PlatformCommissionPct)
		if commissionErr != nil {
			return nil, fmt.Errorf("calculate pool commission: %w", commissionErr)
		}
		platformCommission = commissionMoney.AmountMinor

	case domain.SettlementBasisPerKM:
		// Model B: Commission only from travel revenue (BaseFare + PerKM)
		commissionMoney, commissionErr := domain.LegacyIDR(totalTravelRevenue).MultiplyPercent(config.PlatformCommissionPct)
		if commissionErr != nil {
			return nil, fmt.Errorf("calculate travel commission: %w", commissionErr)
		}
		platformCommission = commissionMoney.AmountMinor

	default:
		return nil, fmt.Errorf("unknown commission basis: %s", config.CommissionBasis)
	}

	// Courier earnings
	courierPerKMEarning := perKMRevenue
	if config.CommissionBasis == domain.SettlementBasisPerKM {
		commissionMoney, commissionErr := domain.LegacyIDR(perKMRevenue).MultiplyPercent(config.PlatformCommissionPct)
		if commissionErr != nil {
			return nil, fmt.Errorf("calculate courier distance commission: %w", commissionErr)
		}
		courierPerKMEarning = perKMRevenue - commissionMoney.AmountMinor
	}

	courierBaseFee := baseFareRevenue
	if !config.CourierKeepsBaseFee && config.CommissionBasis == domain.SettlementBasisPerKM {
		commissionMoney, commissionErr := domain.LegacyIDR(baseFareRevenue).MultiplyPercent(config.PlatformCommissionPct)
		if commissionErr != nil {
			return nil, fmt.Errorf("calculate courier base commission: %w", commissionErr)
		}
		courierBaseFee = baseFareRevenue - commissionMoney.AmountMinor
	}

	courierToll := int64(0)
	if config.CourierKeepsToll {
		courierToll = tollCost
	}

	netEarnings := operationalPool - platformCommission

	return &domain.SettlementResult{
		Currency:              "IDR",
		CurrencyMinorUnit:     0,
		GrossTotal:            grossTotal,
		MDRAmount:             mdrAmount,
		TaxAmount:             taxAmount,
		InsuranceFee:          insuranceFee,
		OperationalPool:       operationalPool,
		CommissionBasis:       string(config.CommissionBasis),
		PerKMRevenue:          perKMRevenue,
		BaseFareRevenue:       baseFareRevenue,
		PlatformCommissionPct: config.PlatformCommissionPct,
		PlatformCommissionAmt: platformCommission,
		CourierServiceFee:     courierServicePrice,
		CourierBaseFee:        courierBaseFee,
		CourierTollReimburse:  courierToll,
		CourierPerKMEarning:   courierPerKMEarning,
		EstimatedNetEarnings:  netEarnings,
		SettlementModel:       string(config.CommissionBasis),
		AppliesToService:      []string{serviceCode},
	}, nil
}

func (s *settlementServiceImpl) GetSettlementConfig(ctx context.Context, serviceCode string) (*domain.SettlementConfig, error) {
	return s.repo.GetSettlementConfig(ctx, serviceCode)
}
