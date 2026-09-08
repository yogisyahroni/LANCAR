package service

import (
	"context"
	"fmt"

	"tembus/order-service/internal/domain"
)

// FXService owns conversion plus persistence of the locked-rate audit record.
// Callers receive both values so downstream settlement can retain the exact
// source/target context instead of comparing bare integers.
type FXService interface {
	ConvertAndRecord(ctx context.Context, req domain.FXConversionRequest) (domain.Money, domain.FXConversionRecord, error)
}

type fxService struct {
	repo domain.FXConversionRepository
}

func NewFXService(repo domain.FXConversionRepository) FXService {
	return &fxService{repo: repo}
}

func (s *fxService) ConvertAndRecord(ctx context.Context, req domain.FXConversionRequest) (domain.Money, domain.FXConversionRecord, error) {
	converted, record, err := domain.ConvertMoney(req)
	if err != nil {
		return domain.Money{}, domain.FXConversionRecord{}, err
	}
	if s == nil || s.repo == nil {
		return domain.Money{}, domain.FXConversionRecord{}, fmt.Errorf("FX conversion repository is required to record the locked rate")
	}
	if err := s.repo.CreateFXConversion(ctx, &record); err != nil {
		return domain.Money{}, domain.FXConversionRecord{}, fmt.Errorf("record FX conversion: %w", err)
	}
	return converted, record, nil
}
