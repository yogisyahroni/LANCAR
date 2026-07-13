package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"tembus/order-service/internal/domain"

	"github.com/google/uuid"
)

type postgresLedgerRepository struct {
	db *sql.DB
}

func NewPostgresLedgerRepository(db *sql.DB) domain.FinanceLedgerRepository {
	return &postgresLedgerRepository{db: db}
}

func (r *postgresLedgerRepository) CreateJournalWithEntries(ctx context.Context, journal *domain.LedgerJournal, entries []domain.LedgerEntry) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	metadataJSON, err := json.Marshal(journal.Metadata)
	if err != nil {
		metadataJSON = []byte("{}")
	}

	// 1. Insert Journal
	var journalID string
	queryJournal := `
		INSERT INTO ledger_journals 
		(journal_type, reference_type, reference_id, idempotency_key, reason, metadata, created_by, actor_role)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id
	`
	err = tx.QueryRowContext(ctx, queryJournal,
		journal.JournalType,
		journal.ReferenceType,
		journal.ReferenceID,
		journal.IdempotencyKey,
		journal.Reason,
		string(metadataJSON),
		journal.CreatedBy,
		journal.ActorRole,
	).Scan(&journalID)

	if err != nil {
		return fmt.Errorf("failed to insert ledger_journal: %w", err)
	}

	// 2. Insert Entries
	queryEntry := `
		INSERT INTO ledger_entries 
		(journal_id, account_name, debit_idr, credit_idr)
		VALUES ($1, $2, $3, $4)
	`
	for _, entry := range entries {
		_, err = tx.ExecContext(ctx, queryEntry,
			journalID,
			entry.AccountName,
			entry.DebitIDR,
			entry.CreditIDR,
		)
		if err != nil {
			return fmt.Errorf("failed to insert ledger_entry (%s): %w", entry.AccountName, err)
		}
	}

	return tx.Commit()
}

func (r *postgresLedgerRepository) CreateJournalReturningID(ctx context.Context, journal *domain.LedgerJournal, entries []domain.LedgerEntry) (uuid.UUID, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return uuid.Nil, fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	metadataJSON, err := json.Marshal(journal.Metadata)
	if err != nil {
		metadataJSON = []byte("{}")
	}

	var journalIDStr string
	queryJournal := `
		INSERT INTO ledger_journals 
		(journal_type, reference_type, reference_id, idempotency_key, reason, metadata, created_by, actor_role)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id
	`
	err = tx.QueryRowContext(ctx, queryJournal,
		journal.JournalType,
		journal.ReferenceType,
		journal.ReferenceID,
		journal.IdempotencyKey,
		journal.Reason,
		string(metadataJSON),
		journal.CreatedBy,
		journal.ActorRole,
	).Scan(&journalIDStr)

	if err != nil {
		return uuid.Nil, fmt.Errorf("failed to insert ledger_journal: %w", err)
	}

	journalUUID, err := uuid.Parse(journalIDStr)
	if err != nil {
		return uuid.Nil, fmt.Errorf("invalid uuid returned for ledger_journal: %w", err)
	}

	queryEntry := `
		INSERT INTO ledger_entries 
		(journal_id, account_name, debit_idr, credit_idr)
		VALUES ($1, $2, $3, $4)
	`
	for _, entry := range entries {
		_, err = tx.ExecContext(ctx, queryEntry,
			journalUUID,
			entry.AccountName,
			entry.DebitIDR,
			entry.CreditIDR,
		)
		if err != nil {
			return uuid.Nil, fmt.Errorf("failed to insert ledger_entry (%s): %w", entry.AccountName, err)
		}
	}

	if err := tx.Commit(); err != nil {
		return uuid.Nil, err
	}
	return journalUUID, nil
}

