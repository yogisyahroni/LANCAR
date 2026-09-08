package domain

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

// FXConversionRecord is an immutable audit record for a cross-currency
// conversion. The decimal rate and locked reference are persisted as text so
// reconciliation can reproduce the exact conversion without float drift.
type FXConversionRecord struct {
	ID                  uuid.UUID `json:"id" db:"id"`
	ReferenceType       string    `json:"reference_type" db:"reference_type"`
	ReferenceID         string    `json:"reference_id" db:"reference_id"`
	SourceCurrency      string    `json:"source_currency" db:"source_currency"`
	SourceMinorUnit     int       `json:"source_minor_unit" db:"source_minor_unit"`
	SourceAmountMinor   int64     `json:"source_amount_minor" db:"source_amount_minor"`
	TargetCurrency      string    `json:"target_currency" db:"target_currency"`
	TargetMinorUnit     int       `json:"target_minor_unit" db:"target_minor_unit"`
	TargetAmountMinor   int64     `json:"target_amount_minor" db:"target_amount_minor"`
	FXRate              string    `json:"fx_rate" db:"fx_rate"`
	RateSource          string    `json:"rate_source" db:"rate_source"`
	RateTimestamp       time.Time `json:"rate_timestamp" db:"rate_timestamp"`
	SpreadMinor         int64     `json:"spread_minor" db:"spread_minor"`
	FeeMinor            int64     `json:"fee_minor" db:"fee_minor"`
	LockedRateReference string    `json:"locked_rate_reference" db:"locked_rate_reference"`
	CreatedAt           time.Time `json:"created_at" db:"created_at"`
}

type FXConversionRequest struct {
	ReferenceType       string
	ReferenceID         string
	Source              Money
	TargetCurrency      string
	FXRate              string
	RateSource          string
	RateTimestamp       time.Time
	SpreadMinor         int64
	FeeMinor            int64
	LockedRateReference string
}

// FXConversionRepository persists the immutable conversion audit record.
type FXConversionRepository interface {
	CreateFXConversion(ctx context.Context, record *FXConversionRecord) error
}

func ConvertMoney(req FXConversionRequest) (Money, FXConversionRecord, error) {
	if err := req.Source.Validate(); err != nil {
		return Money{}, FXConversionRecord{}, err
	}
	targetCurrency, targetMinorUnit, err := NormalizeCurrency(req.TargetCurrency)
	if err != nil {
		return Money{}, FXConversionRecord{}, err
	}
	if req.Source.Currency == targetCurrency {
		return Money{}, FXConversionRecord{}, fmt.Errorf("FX conversion requires different currencies")
	}
	if strings.TrimSpace(req.ReferenceType) == "" || strings.TrimSpace(req.ReferenceID) == "" {
		return Money{}, FXConversionRecord{}, fmt.Errorf("FX reference type and ID are required")
	}
	if strings.TrimSpace(req.RateSource) == "" || strings.TrimSpace(req.LockedRateReference) == "" {
		return Money{}, FXConversionRecord{}, fmt.Errorf("FX rate source and locked reference are required")
	}
	if req.RateTimestamp.IsZero() {
		return Money{}, FXConversionRecord{}, fmt.Errorf("FX rate timestamp is required")
	}
	if req.SpreadMinor < 0 || req.FeeMinor < 0 {
		return Money{}, FXConversionRecord{}, fmt.Errorf("FX spread and fee must not be negative")
	}
	converted, err := Money{AmountMinor: req.Source.AmountMinor, Currency: targetCurrency, MinorUnit: targetMinorUnit}.MultiplyDecimal(req.FXRate)
	if err != nil {
		return Money{}, FXConversionRecord{}, err
	}
	if req.SpreadMinor+req.FeeMinor > converted.AmountMinor {
		return Money{}, FXConversionRecord{}, fmt.Errorf("FX spread and fee exceed converted amount")
	}
	converted.AmountMinor -= req.SpreadMinor + req.FeeMinor
	record := FXConversionRecord{
		ID:                  uuid.New(),
		ReferenceType:       req.ReferenceType,
		ReferenceID:         req.ReferenceID,
		SourceCurrency:      req.Source.Currency,
		SourceMinorUnit:     req.Source.MinorUnit,
		SourceAmountMinor:   req.Source.AmountMinor,
		TargetCurrency:      targetCurrency,
		TargetMinorUnit:     targetMinorUnit,
		TargetAmountMinor:   converted.AmountMinor,
		FXRate:              req.FXRate,
		RateSource:          req.RateSource,
		RateTimestamp:       req.RateTimestamp.UTC(),
		SpreadMinor:         req.SpreadMinor,
		FeeMinor:            req.FeeMinor,
		LockedRateReference: req.LockedRateReference,
		CreatedAt:           time.Now().UTC(),
	}
	return converted, record, nil
}
