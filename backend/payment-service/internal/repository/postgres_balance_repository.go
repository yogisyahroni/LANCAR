package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"

	"tembus/payment-service/internal/domain"
)

type BalanceRepository interface {
	EnsureAccount(ctx context.Context, ownerType, marketCode, currency string, ownerID *uuid.UUID, balanceType domain.BalanceType) (uuid.UUID, error)
	Apply(ctx context.Context, accountID uuid.UUID, operation domain.BalanceOperation) (domain.BalanceSnapshot, bool, error)
	Snapshot(ctx context.Context, accountID uuid.UUID) (domain.BalanceSnapshot, error)
}

type postgresBalanceRepository struct{ db *sql.DB }

func NewPostgresBalanceRepository(db *sql.DB) BalanceRepository {
	return &postgresBalanceRepository{db: db}
}

func (r *postgresBalanceRepository) EnsureAccount(ctx context.Context, ownerType, marketCode, currency string, ownerID *uuid.UUID, balanceType domain.BalanceType) (uuid.UUID, error) {
	ownerType = strings.ToUpper(strings.TrimSpace(ownerType))
	marketCode = strings.ToLower(strings.TrimSpace(marketCode))
	currency = strings.ToUpper(strings.TrimSpace(currency))
	if ownerType == "" || marketCode == "" || len(currency) != 3 {
		return uuid.Nil, errors.New("owner type, market code and three-letter currency are required")
	}
	var id uuid.UUID
	err := r.db.QueryRowContext(ctx, `
		INSERT INTO payment_balance_accounts (owner_type, owner_id, balance_type, market_code, currency)
		VALUES ($1,$2,$3,$4,$5)
		ON CONFLICT (owner_type, owner_id, balance_type, market_code, currency)
		DO UPDATE SET market_code = EXCLUDED.market_code
		RETURNING id`, ownerType, ownerID, balanceType, marketCode, currency).Scan(&id)
	return id, err
}

func (r *postgresBalanceRepository) Apply(ctx context.Context, accountID uuid.UUID, operation domain.BalanceOperation) (domain.BalanceSnapshot, bool, error) {
	if accountID == uuid.Nil || operation.IdempotencyKey == "" || operation.SourceType == "" || operation.SourceID == "" {
		return domain.BalanceSnapshot{}, false, errors.New("account and operation identity are required")
	}
	if operation.AmountMinor <= 0 {
		return domain.BalanceSnapshot{}, false, errors.New("balance amount must be positive")
	}
	metadata, err := json.Marshal(operation.Metadata)
	if err != nil {
		return domain.BalanceSnapshot{}, false, fmt.Errorf("marshal balance metadata: %w", err)
	}
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return domain.BalanceSnapshot{}, false, err
	}
	defer func() { _ = tx.Rollback() }()
	var lockedID uuid.UUID
	if err = tx.QueryRowContext(ctx, `SELECT id FROM payment_balance_accounts WHERE id=$1 FOR UPDATE`, accountID).Scan(&lockedID); err != nil {
		return domain.BalanceSnapshot{}, false, fmt.Errorf("lock balance account: %w", err)
	}
	var existing domain.BalanceEntry
	err = tx.QueryRowContext(ctx, `SELECT account_id, entry_type, amount_minor, source_type, source_id FROM payment_balance_entries WHERE idempotency_key=$1`, operation.IdempotencyKey).
		Scan(&existing.AccountID, &existing.EntryType, &existing.AmountMinor, &existing.SourceType, &existing.SourceID)
	if err == nil {
		if existing.AccountID != accountID.String() || existing.EntryType != operation.EntryType || existing.AmountMinor != operation.AmountMinor || existing.SourceType != operation.SourceType || existing.SourceID != operation.SourceID {
			return domain.BalanceSnapshot{}, false, domain.ErrBalanceIdempotencyReuse
		}
		snapshot, snapshotErr := r.snapshotTx(ctx, tx, accountID)
		if snapshotErr != nil {
			return domain.BalanceSnapshot{}, false, snapshotErr
		}
		if err = tx.Commit(); err != nil {
			return domain.BalanceSnapshot{}, false, err
		}
		return snapshot, true, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return domain.BalanceSnapshot{}, false, fmt.Errorf("lookup balance idempotency: %w", err)
	}
	current, err := r.snapshotTx(ctx, tx, accountID)
	if err != nil {
		return domain.BalanceSnapshot{}, false, err
	}
	next, err := domain.ApplyBalanceOperation(current, operation)
	if err != nil {
		return current, false, err
	}
	_, err = tx.ExecContext(ctx, `
		INSERT INTO payment_balance_entries
		(account_id, entry_type, amount_minor, source_type, source_id, idempotency_key, metadata)
		VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`, accountID, operation.EntryType, operation.AmountMinor, operation.SourceType, operation.SourceID, operation.IdempotencyKey, string(metadata))
	if err != nil {
		return current, false, fmt.Errorf("insert balance entry: %w", err)
	}
	if err = tx.Commit(); err != nil {
		return domain.BalanceSnapshot{}, false, err
	}
	return next, false, nil
}

func (r *postgresBalanceRepository) Snapshot(ctx context.Context, accountID uuid.UUID) (domain.BalanceSnapshot, error) {
	return r.snapshotDB(ctx, r.db, accountID)
}

type balanceQueryer interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func (r *postgresBalanceRepository) snapshotDB(ctx context.Context, db balanceQueryer, accountID uuid.UUID) (domain.BalanceSnapshot, error) {
	var snapshot domain.BalanceSnapshot
	err := db.QueryRowContext(ctx, `
		SELECT
			COALESCE(SUM(CASE WHEN entry_type IN ('CREDIT','RELEASE','REVERSAL') THEN amount_minor WHEN entry_type IN ('DEBIT','HOLD') THEN -amount_minor ELSE 0 END),0)::bigint,
			COALESCE(SUM(CASE WHEN entry_type = 'HOLD' THEN amount_minor WHEN entry_type IN ('RELEASE','SETTLE') THEN -amount_minor ELSE 0 END),0)::bigint
		FROM payment_balance_entries WHERE account_id=$1`, accountID).Scan(&snapshot.AvailableMinor, &snapshot.HeldMinor)
	return snapshot, err
}

func (r *postgresBalanceRepository) snapshotTx(ctx context.Context, tx *sql.Tx, accountID uuid.UUID) (domain.BalanceSnapshot, error) {
	return r.snapshotDB(ctx, tx, accountID)
}
