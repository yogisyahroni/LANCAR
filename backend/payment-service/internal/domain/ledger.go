package domain

import (
	"context"
	"time"

	"github.com/google/uuid"
)

type LedgerJournal struct {
	ID             uuid.UUID      `json:"id" db:"id"`
	JournalType    string         `json:"journal_type" db:"journal_type"` // payment, refund, wallet_topup, wallet_withdraw, etc.
	ReferenceType  string         `json:"reference_type" db:"reference_type"`
	ReferenceID    string         `json:"reference_id" db:"reference_id"`
	IdempotencyKey string         `json:"idempotency_key" db:"idempotency_key"`
	Reason         string         `json:"reason" db:"reason"`
	Metadata       map[string]any `json:"metadata" db:"metadata"`
	CreatedBy      string         `json:"created_by" db:"created_by"`
	ActorRole      string         `json:"actor_role" db:"actor_role"`
	CreatedAt      time.Time      `json:"created_at" db:"created_at"`
}

type LedgerEntry struct {
	ID          uuid.UUID `json:"id" db:"id"`
	JournalID   uuid.UUID `json:"journal_id" db:"journal_id"`
	AccountName string    `json:"account_name" db:"account_name"`
	DebitIDR    int64     `json:"debit_idr" db:"debit_idr"`
	CreditIDR   int64     `json:"credit_idr" db:"credit_idr"`
	CreatedAt   time.Time `json:"created_at" db:"created_at"`
}

type FinanceLedgerRepository interface {
	CreateJournalWithEntries(ctx context.Context, journal *LedgerJournal, entries []LedgerEntry) error
}
