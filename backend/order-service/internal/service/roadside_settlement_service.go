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
	taxPolicy  domain.RoadsideSettlementTaxPolicy
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
	if err := domain.ValidateRoadsideSettlementSource(source); err != nil {
		return nil, err
	}

	serviceCode := strings.TrimSpace(source.ServiceCode)
	if serviceCode == "" {
		serviceCode = strings.TrimSpace(source.ServiceSubType)
	}
	config, err := s.configRepo.GetSettlementConfig(ctx, serviceCode)
	if err != nil {
		return nil, fmt.Errorf("settlement config not found for %s: %w", serviceCode, err)
	}

	return domain.CalculateRoadsideSettlement(source, config)
}

// SetTaxPolicy installs the configured withholding policy before finalization.
func (s *roadsideSettlementService) SetTaxPolicy(policy domain.RoadsideSettlementTaxPolicy) {
	s.taxPolicy = policy
}

func (s *roadsideSettlementService) Finalize(ctx context.Context, orderID, actorID, actorRole string) (*domain.RoadsideSettlementRecord, error) {
	if s.taxPolicy == nil {
		return nil, fmt.Errorf("%w: withholding policy unavailable", domain.ErrRoadsideSettlementCollectionRequired)
	}
	repo, ok := s.sourceRepo.(domain.RoadsideSettlementWriteRepository)
	if !ok {
		return nil, fmt.Errorf("roadside settlement finalization repository unavailable")
	}
	return repo.FinalizeRoadsideSettlement(ctx, strings.TrimSpace(orderID), strings.TrimSpace(actorID), strings.ToLower(strings.TrimSpace(actorRole)), s.configRepo, s.taxPolicy)
}
