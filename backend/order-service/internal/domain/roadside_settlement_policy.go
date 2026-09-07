package domain

import (
	"fmt"
	"math"
	"math/big"
	"strings"
)

// RoadsidePercent calculates an integer-rupiah percentage without floating
// point multiplication or conversion of an out-of-range float to int64.
func RoadsidePercent(amount int64, percent float64) (int64, error) {
	if amount < 0 || math.IsNaN(percent) || math.IsInf(percent, 0) || percent < 0 || percent > 100 {
		return 0, fmt.Errorf("%w: invalid settlement percentage", ErrInvalidServiceReport)
	}
	rate, ok := new(big.Rat).SetString(strings.TrimSpace(fmt.Sprintf("%.15g", percent)))
	if !ok {
		return 0, fmt.Errorf("%w: invalid settlement percentage", ErrInvalidServiceReport)
	}
	value := new(big.Rat).Mul(new(big.Rat).SetInt64(amount), rate)
	value.Quo(value, big.NewRat(100, 1))
	n := new(big.Int).Quo(value.Num(), value.Denom())
	if !n.IsInt64() {
		return 0, fmt.Errorf("%w: settlement amount overflow", ErrInvalidServiceReport)
	}
	return n.Int64(), nil
}

func ValidateRoadsideSettlementSource(s *RoadsideSettlementSource) error {
	if s == nil || strings.TrimSpace(s.OrderID) == "" {
		return ErrRoadsideSettlementNotFound
	}
	if s.Status != StatusDelivered && s.Status != OrderStatus("completed") {
		return ErrRoadsideSettlementNotDelivered
	}
	if !s.FinalReportReady || strings.TrimSpace(s.ReportID) == "" || strings.TrimSpace(s.AssignedCourierID) == "" {
		return ErrRoadsideSettlementProofRequired
	}
	if !s.FinancialReady || s.CollectedTotalIDR != s.GrossTotalIDR {
		return ErrRoadsideSettlementCollectionRequired
	}
	if !strings.HasPrefix(strings.ToLower(strings.TrimSpace(s.ServiceCode)), "tambal_ban_") && !strings.HasPrefix(strings.ToLower(strings.TrimSpace(s.ServiceSubType)), "tambal_ban_") {
		return ErrRoadsideSettlementNotFound
	}
	if s.GrossTotalIDR <= 0 || s.BaseFareIDR < 0 || s.DistanceFeeIDR < 0 || s.InsuranceFeeIDR < 0 || s.BaseFareIDR > s.GrossTotalIDR || s.DistanceFeeIDR > s.GrossTotalIDR-s.BaseFareIDR || s.InsuranceFeeIDR > s.GrossTotalIDR-s.BaseFareIDR-s.DistanceFeeIDR {
		return fmt.Errorf("%w: authoritative financial snapshot invalid", ErrInvalidServiceReport)
	}
	return nil
}

// CalculateRoadsideSettlement uses only persisted source and service configuration.
func CalculateRoadsideSettlement(source *RoadsideSettlementSource, config *SettlementConfig) (*SettlementResult, error) {
	if err := ValidateRoadsideSettlementSource(source); err != nil {
		return nil, err
	}
	if config == nil {
		return nil, fmt.Errorf("%w: missing settlement configuration", ErrInvalidServiceReport)
	}
	serviceCode := strings.TrimSpace(source.ServiceCode)
	if serviceCode == "" {
		serviceCode = strings.TrimSpace(source.ServiceSubType)
	}
	mdrAmount, err := RoadsidePercent(source.GrossTotalIDR, config.MDRPct)
	if err != nil {
		return nil, err
	}
	taxAmount, err := RoadsidePercent(source.GrossTotalIDR, config.TaxPct)
	if err != nil {
		return nil, err
	}
	if mdrAmount > source.GrossTotalIDR || taxAmount > source.GrossTotalIDR-mdrAmount || source.InsuranceFeeIDR > source.GrossTotalIDR-mdrAmount-taxAmount {
		return nil, fmt.Errorf("%w: operational pool negative", ErrInvalidServiceReport)
	}
	operationalPool := source.GrossTotalIDR - mdrAmount - taxAmount - source.InsuranceFeeIDR
	travelRevenue := source.BaseFareIDR + source.DistanceFeeIDR
	var platformCommission int64
	switch config.CommissionBasis {
	case SettlementBasisPool:
		platformCommission, err = RoadsidePercent(operationalPool, config.PlatformCommissionPct)
	case SettlementBasisPerKM:
		platformCommission, err = RoadsidePercent(travelRevenue, config.PlatformCommissionPct)
	default:
		return nil, fmt.Errorf("unknown commission basis: %s", config.CommissionBasis)
	}
	if err != nil {
		return nil, err
	}
	if platformCommission > operationalPool {
		return nil, fmt.Errorf("%w: commission exceeds pool", ErrInvalidServiceReport)
	}

	courierDistanceEarning := source.DistanceFeeIDR
	if config.CommissionBasis == SettlementBasisPerKM {
		distanceCommission, err := RoadsidePercent(source.DistanceFeeIDR, config.PlatformCommissionPct)
		if err != nil {
			return nil, err
		}
		courierDistanceEarning -= distanceCommission
	}
	courierBaseFee := source.BaseFareIDR
	if !config.CourierKeepsBaseFee && config.CommissionBasis == SettlementBasisPerKM {
		baseCommission, err := RoadsidePercent(source.BaseFareIDR, config.PlatformCommissionPct)
		if err != nil {
			return nil, err
		}
		courierBaseFee -= baseCommission
	}

	return &SettlementResult{
		GrossTotal:            source.GrossTotalIDR,
		MDRAmount:             mdrAmount,
		TaxAmount:             taxAmount,
		InsuranceFee:          source.InsuranceFeeIDR,
		OperationalPool:       operationalPool,
		CommissionBasis:       string(config.CommissionBasis),
		PerKMRevenue:          source.DistanceFeeIDR,
		BaseFareRevenue:       source.BaseFareIDR,
		PlatformCommissionPct: config.PlatformCommissionPct,
		PlatformCommissionAmt: platformCommission,
		CourierServiceFee:     0, // no separate immutable fee exists in the canonical order snapshot
		CourierBaseFee:        courierBaseFee,
		CourierTollReimburse:  0,
		CourierPerKMEarning:   courierDistanceEarning,
		EstimatedNetEarnings:  operationalPool - platformCommission,
		SettlementModel:       string(config.CommissionBasis),
		AppliesToService:      []string{serviceCode},
	}, nil
}
