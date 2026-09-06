package service

import (
	"context"
	"fmt"
	"strings"
	"tembus/order-service/internal/domain"
)

type roadsideSettlementService struct {
	sourceRepo domain.RoadsideSettlementSourceRepository
	configRepo domain.SettlementRepository
}

func NewRoadsideSettlementService(
	sourceRepo domain.RoadsideSettlementSourceRepository,
	configRepo domain.SettlementRepository,
) domain.RoadsideSettlementService {
	return &roadsideSettlementService{sourceRepo: sourceRepo, configRepo: configRepo}
}

func (s *roadsideSettlementService) Calculate(ctx context.Context, orderID, actorID, actorRole string) (*domain.SettlementResult, error) {
	orderID = strings.TrimSpace(orderID)
	actorID = strings.TrimSpace(actorID)
	actorRole = strings.ToLower(strings.TrimSpace(actorRole))
	if orderID == "" || actorID == "" {
		return nil, fmt.Errorf("%w: order dan actor wajib", domain.ErrInvalidServiceReport)
	}

	source, err := s.sourceRepo.GetRoadsideSettlementSource(ctx, orderID)
	if err != nil {
		return nil, err
	}
	if actorRole != "admin" && actorRole != "super_admin" {
		if actorRole != "courier" || source.AssignedCourierID == "" || source.AssignedCourierID != actorID {
			return nil, domain.ErrForbidden
		}
	}
	if source.Status != domain.StatusDelivered {
		return nil, domain.ErrRoadsideSettlementNotDelivered
	}
	if !source.FinalReportReady {
		return nil, domain.ErrRoadsideSettlementProofRequired
	}
	if source.GrossTotalIDR <= 0 || source.BaseFareIDR < 0 || source.DistanceFeeIDR < 0 || source.InsuranceFeeIDR < 0 {
		return nil, fmt.Errorf("%w: authoritative financial snapshot invalid", domain.ErrInvalidServiceReport)
	}

	serviceCode := strings.TrimSpace(source.ServiceCode)
	if serviceCode == "" {
		serviceCode = strings.TrimSpace(source.ServiceSubType)
	}
	config, err := s.configRepo.GetSettlementConfig(ctx, serviceCode)
	if err != nil {
		return nil, fmt.Errorf("settlement config not found for %s: %w", serviceCode, err)
	}

	mdrAmount := int64(float64(source.GrossTotalIDR) * config.MDRPct / 100.0)
	taxAmount := int64(float64(source.GrossTotalIDR) * config.TaxPct / 100.0)
	operationalPool := source.GrossTotalIDR - mdrAmount - taxAmount - source.InsuranceFeeIDR
	if operationalPool < 0 {
		return nil, fmt.Errorf("%w: operational pool negative", domain.ErrInvalidServiceReport)
	}

	// Use the frozen distance fee itself rather than recomputing from a live
	// per-km tariff. This preserves the quote used when the order was created.
	travelRevenue := source.BaseFareIDR + source.DistanceFeeIDR
	var platformCommission int64
	switch config.CommissionBasis {
	case domain.SettlementBasisPool:
		platformCommission = int64(float64(operationalPool) * config.PlatformCommissionPct / 100.0)
	case domain.SettlementBasisPerKM:
		platformCommission = int64(float64(travelRevenue) * config.PlatformCommissionPct / 100.0)
	default:
		return nil, fmt.Errorf("unknown commission basis: %s", config.CommissionBasis)
	}

	courierDistanceEarning := source.DistanceFeeIDR
	if config.CommissionBasis == domain.SettlementBasisPerKM {
		courierDistanceEarning -= int64(float64(source.DistanceFeeIDR) * config.PlatformCommissionPct / 100.0)
	}
	courierBaseFee := source.BaseFareIDR
	if !config.CourierKeepsBaseFee && config.CommissionBasis == domain.SettlementBasisPerKM {
		courierBaseFee -= int64(float64(source.BaseFareIDR) * config.PlatformCommissionPct / 100.0)
	}

	return &domain.SettlementResult{
		GrossTotal:              source.GrossTotalIDR,
		MDRAmount:               mdrAmount,
		TaxAmount:               taxAmount,
		InsuranceFee:            source.InsuranceFeeIDR,
		OperationalPool:         operationalPool,
		CommissionBasis:         string(config.CommissionBasis),
		PerKMRevenue:            source.DistanceFeeIDR,
		BaseFareRevenue:         source.BaseFareIDR,
		PlatformCommissionPct:   config.PlatformCommissionPct,
		PlatformCommissionAmt:   platformCommission,
		CourierServiceFee:       0, // no separate immutable fee exists in the canonical order snapshot
		CourierBaseFee:          courierBaseFee,
		CourierTollReimburse:    0,
		CourierPerKMEarning:     courierDistanceEarning,
		EstimatedNetEarnings:    operationalPool - platformCommission,
		SettlementModel:         string(config.CommissionBasis),
		AppliesToService:        []string{serviceCode},
	}, nil
}
