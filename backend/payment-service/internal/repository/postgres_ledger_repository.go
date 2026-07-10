package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"tembus/payment-service/internal/domain"
)

type postgresLedgerRepository struct {
	db *sql.DB
}

func NewPostgresLedgerRepository(db *sql.DB) domain.FinanceLedgerRepository {
	return &postgresLedgerRepository{db: db}
}

func (r *postgresLedgerRepository) CreateJournalWithEntries(ctx context.Context, journal *domain.LedgerJournal, entries []domain.LedgerEntry) error {
	// Must execute within an existing transaction to be atomic with wallet updates.
	tx, ok := ctx.Value(txKey{}).(*sql.Tx)
	if !ok {
		return fmt.Errorf("CreateJournalWithEntries must be called within a transaction context")
	}

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

	return nil
}
