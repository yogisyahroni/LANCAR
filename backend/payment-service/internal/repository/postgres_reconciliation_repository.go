package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/google/uuid"

	"tembus/payment-service/internal/domain"
)

type postgresReconciliationStore struct{ db *sql.DB }

func NewPostgresReconciliationStore(db *sql.DB) interface {
	RecordException(context.Context, *domain.ReconciliationRecord, *domain.ReconciliationRecord, *domain.ReconciliationRecord, domain.ReconciliationException) error
} {
	return &postgresReconciliationStore{db: db}
}

func (r *postgresReconciliationStore) RecordException(ctx context.Context, internal, provider, settlement *domain.ReconciliationRecord, exception domain.ReconciliationException) error {
	intentID, err := uuid.Parse(internal.IntentID)
	if err != nil {
		return fmt.Errorf("invalid reconciliation intent id: %w", err)
	}
	providerName := strings.TrimSpace(internal.Provider)
	if provider != nil && strings.TrimSpace(provider.Provider) != "" {
		providerName = strings.TrimSpace(provider.Provider)
	}
	if providerName == "" {
		providerName = "unknown"
	}
	providerReference := ""
	var actualAmount any
	var actualState any
	providerBatchDate := ""
	if provider != nil {
		providerReference = strings.TrimSpace(provider.ProviderReference)
		actualAmount = provider.AmountMinor
		actualState = provider.State
		providerBatchDate = strings.TrimSpace(provider.BatchDate)
	}
	metadata, _ := json.Marshal(map[string]any{
		"reason":                exception.Reason,
		"internal_batch_date":   valueOrEmpty(internal.BatchDate),
		"provider_batch_date":   valueOrEmpty(recordBatchDate(provider)),
		"settlement_batch_date": valueOrEmpty(recordBatchDate(settlement)),
		"internal_timezone":     valueOrEmpty(internal.Timezone),
		"provider_timezone":     valueOrEmpty(recordTimezone(provider)),
		"settlement_timezone":   valueOrEmpty(recordTimezone(settlement)),
	})
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	// Serialize the same logical exception even when the database has no
	// natural unique key for nullable provider references/batch dates.
	dedupeKey := fmt.Sprintf("%s|%s|%s|%s|%s", intentID, providerName, providerReference, exception.Type, providerBatchDate)
	if _, err = tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock(hashtext($1))`, dedupeKey); err != nil {
		return err
	}
	var existingID uuid.UUID
	err = tx.QueryRowContext(ctx, `
		SELECT id FROM payment_reconciliation_exceptions
		 WHERE intent_id=$1 AND provider=$2
		   AND provider_reference IS NOT DISTINCT FROM NULLIF($3,'')
		   AND exception_type=$4
		   AND provider_batch_date IS NOT DISTINCT FROM NULLIF($5,'')::date
		 FOR UPDATE`, intentID, providerName, providerReference, exception.Type, providerBatchDate).Scan(&existingID)
	if err == nil {
		_, err = tx.ExecContext(ctx, `UPDATE payment_reconciliation_exceptions SET last_seen_at=NOW(), metadata=$2::jsonb WHERE id=$1`, existingID, string(metadata))
		if err == nil {
			err = tx.Commit()
		}
		return err
	}
	if err != sql.ErrNoRows {
		return err
	}
	_, err = tx.ExecContext(ctx, `
		INSERT INTO payment_reconciliation_exceptions
		(intent_id, provider, provider_reference, exception_type, expected_state, actual_state,
		 expected_amount_minor, actual_amount_minor, currency, provider_batch_date, metadata)
		VALUES ($1,$2,NULLIF($3,''),$4,$5,$6,$7,$8,$9,NULLIF($10,'')::date,$11::jsonb)`,
		intentID, providerName, providerReference, exception.Type, internal.State, actualState,
		internal.AmountMinor, actualAmount, strings.ToUpper(internal.Currency), providerBatchDate, string(metadata))
	if err != nil {
		return err
	}
	return tx.Commit()
}

func valueOrEmpty(value string) string { return strings.TrimSpace(value) }

func recordBatchDate(record *domain.ReconciliationRecord) string {
	if record == nil {
		return ""
	}
	return record.BatchDate
}

func recordTimezone(record *domain.ReconciliationRecord) string {
	if record == nil {
		return ""
	}
	return record.Timezone
}
