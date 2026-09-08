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

func prepareLedgerMoney(journal *domain.LedgerJournal, entries []domain.LedgerEntry) {
	if journal.Currency == "" {
		journal.Currency = "IDR"
	}
	if code, minorUnit, err := domain.NormalizeCurrency(journal.Currency); err == nil {
		journal.Currency = code
		journal.CurrencyMinorUnit = minorUnit
	}
	for i := range entries {
		if entries[i].Currency == "" {
			entries[i].Currency = journal.Currency
			entries[i].CurrencyMinorUnit = journal.CurrencyMinorUnit
		}
		if entries[i].Currency == "IDR" {
			entries[i].CurrencyMinorUnit = 0
			entries[i].DebitMinor = entries[i].DebitIDR
			entries[i].CreditMinor = entries[i].CreditIDR
		}
	}
}

func NewPostgresLedgerRepository(db *sql.DB) domain.FinanceLedgerRepository {
	return &postgresLedgerRepository{db: db}
}

func (r *postgresLedgerRepository) CreateJournalWithEntries(ctx context.Context, journal *domain.LedgerJournal, entries []domain.LedgerEntry) error {
	prepareLedgerMoney(journal, entries)
	if err := domain.ValidateLedgerJournalMoney(journal, entries); err != nil {
		return fmt.Errorf("validate ledger journal: %w", err)
	}
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
		(journal_type, reference_type, reference_id, idempotency_key, reason, metadata, created_by, actor_role, currency_code, currency_minor_unit)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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
		journal.Currency,
		journal.CurrencyMinorUnit,
	).Scan(&journalID)

	if err != nil {
		return fmt.Errorf("failed to insert ledger_journal: %w", err)
	}

	// 2. Insert Entries
	queryEntry := `
		INSERT INTO ledger_entries 
		(journal_id, account_name, currency_code, currency_minor_unit, debit_minor, credit_minor, debit_idr, credit_idr)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`
	for _, entry := range entries {
		_, err = tx.ExecContext(ctx, queryEntry,
			journalID,
			entry.AccountName, entry.Currency, entry.CurrencyMinorUnit,
			entry.DebitMinor, entry.CreditMinor, entry.DebitIDR, entry.CreditIDR,
		)
		if err != nil {
			return fmt.Errorf("failed to insert ledger_entry (%s): %w", entry.AccountName, err)
		}
	}

	return tx.Commit()
}

func (r *postgresLedgerRepository) CreateJournalReturningID(ctx context.Context, journal *domain.LedgerJournal, entries []domain.LedgerEntry) (uuid.UUID, error) {
	prepareLedgerMoney(journal, entries)
	if err := domain.ValidateLedgerJournalMoney(journal, entries); err != nil {
		return uuid.Nil, fmt.Errorf("validate ledger journal: %w", err)
	}
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
		(journal_type, reference_type, reference_id, idempotency_key, reason, metadata, created_by, actor_role, currency_code, currency_minor_unit)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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
		journal.Currency,
		journal.CurrencyMinorUnit,
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
		(journal_id, account_name, currency_code, currency_minor_unit, debit_minor, credit_minor, debit_idr, credit_idr)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`
	for _, entry := range entries {
		_, err = tx.ExecContext(ctx, queryEntry,
			journalUUID,
			entry.AccountName, entry.Currency, entry.CurrencyMinorUnit,
			entry.DebitMinor, entry.CreditMinor, entry.DebitIDR, entry.CreditIDR,
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
