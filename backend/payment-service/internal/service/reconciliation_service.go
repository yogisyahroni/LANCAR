package service

import (
	"context"

	"tembus/payment-service/internal/domain"
)

type ReconciliationExceptionStore interface {
	RecordException(ctx context.Context, internal, provider, settlement *domain.ReconciliationRecord, exception domain.ReconciliationException) error
}

type ReconciliationService struct {
	store ReconciliationExceptionStore
}

func NewReconciliationService(store ReconciliationExceptionStore) *ReconciliationService {
	return &ReconciliationService{store: store}
}

func (s *ReconciliationService) Reconcile(ctx context.Context, internal, provider, settlement *domain.ReconciliationRecord) ([]domain.ReconciliationException, error) {
	exceptions, err := domain.CompareReconciliation(internal, provider, settlement)
	if err != nil {
		return nil, err
	}
	for _, exception := range exceptions {
		if err := s.store.RecordException(ctx, internal, provider, settlement, exception); err != nil {
			return nil, err
		}
	}
	return exceptions, nil
}
