package domain

import (
	"context"
	"time"

	"github.com/google/uuid"
)

type LedgerJournal struct {
	ID                uuid.UUID      `json:"id" db:"id"`
	JournalType       string         `json:"journal_type" db:"journal_type"` // order_completed, etc.
	ReferenceType     string         `json:"reference_type" db:"reference_type"`
	ReferenceID       string         `json:"reference_id" db:"reference_id"`
	IdempotencyKey    string         `json:"idempotency_key" db:"idempotency_key"`
	Reason            string         `json:"reason" db:"reason"`
	Metadata          map[string]any `json:"metadata" db:"metadata"`
	CreatedBy         string         `json:"created_by" db:"created_by"`
	ActorRole         string         `json:"actor_role" db:"actor_role"`
	Currency          string         `json:"currency" db:"currency_code"`
	CurrencyMinorUnit int            `json:"currency_minor_unit" db:"currency_minor_unit"`
	CreatedAt         time.Time      `json:"created_at" db:"created_at"`
}

type LedgerEntry struct {
	ID                uuid.UUID `json:"id" db:"id"`
	JournalID         uuid.UUID `json:"journal_id" db:"journal_id"`
	AccountName       string    `json:"account_name" db:"account_name"`
	Currency          string    `json:"currency" db:"currency_code"`
	CurrencyMinorUnit int       `json:"currency_minor_unit" db:"currency_minor_unit"`
	DebitMinor        int64     `json:"debit_minor" db:"debit_minor"`
	CreditMinor       int64     `json:"credit_minor" db:"credit_minor"`
	DebitIDR          int64     `json:"debit_idr" db:"debit_idr"`
	CreditIDR         int64     `json:"credit_idr" db:"credit_idr"`
	CreatedAt         time.Time `json:"created_at" db:"created_at"`
}

type FinanceLedgerRepository interface {
	CreateJournalWithEntries(ctx context.Context, journal *LedgerJournal, entries []LedgerEntry) error
	CreateJournalReturningID(ctx context.Context, journal *LedgerJournal, entries []LedgerEntry) (uuid.UUID, error)
}
