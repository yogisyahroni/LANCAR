package repository

import (
	"context"
	"fmt"

	"github.com/jmoiron/sqlx"
	"tembus/order-service/internal/domain"
)

// PostgresFXConversionRepository stores the immutable FX conversion context
// created by the FX service. The database trigger provides the second layer
// of immutability after this repository has validated the record.
type PostgresFXConversionRepository struct {
	db *sqlx.DB
}

func NewPostgresFXConversionRepository(db *sqlx.DB) *PostgresFXConversionRepository {
	return &PostgresFXConversionRepository{db: db}
}

func (r *PostgresFXConversionRepository) CreateFXConversion(ctx context.Context, record *domain.FXConversionRecord) error {
	if r == nil || r.db == nil {
		return fmt.Errorf("FX conversion database is required")
	}
	if record == nil {
		return fmt.Errorf("FX conversion record is required")
	}
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO fx_conversion_records (
			id, reference_type, reference_id,
			source_currency, source_minor_unit, source_amount_minor,
			target_currency, target_minor_unit, target_amount_minor,
			fx_rate, rate_source, rate_timestamp, spread_minor, fee_minor,
			locked_rate_reference, created_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
	`,
		record.ID, record.ReferenceType, record.ReferenceID,
		record.SourceCurrency, record.SourceMinorUnit, record.SourceAmountMinor,
		record.TargetCurrency, record.TargetMinorUnit, record.TargetAmountMinor,
		record.FXRate, record.RateSource, record.RateTimestamp,
		record.SpreadMinor, record.FeeMinor, record.LockedRateReference,
		record.CreatedAt,
	)
	return err
}
