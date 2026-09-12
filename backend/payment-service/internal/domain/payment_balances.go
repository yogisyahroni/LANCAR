package domain

import (
	"errors"
	"fmt"
	"sync"
)

type BalanceType string

const (
	BalanceCustomerCredit  BalanceType = "CUSTOMER_CREDIT"
	BalanceRefundCredit    BalanceType = "REFUND_CREDIT"
	BalanceMerchantPayable BalanceType = "MERCHANT_PAYABLE"
	BalanceCourierEarnings BalanceType = "COURIER_EARNINGS"
	BalanceAds             BalanceType = "ADS_BALANCE"
	BalancePromotional     BalanceType = "PROMOTIONAL_CREDIT"
)

var ErrPromotionalBalanceNotWithdrawable = errors.New("promotional credit cannot be withdrawn as cash")

type BalanceEntryType string

const (
	BalanceCredit   BalanceEntryType = "CREDIT"
	BalanceDebit    BalanceEntryType = "DEBIT"
	BalanceHold     BalanceEntryType = "HOLD"
	BalanceRelease  BalanceEntryType = "RELEASE"
	BalanceSettle   BalanceEntryType = "SETTLE"
	BalanceReversal BalanceEntryType = "REVERSAL"
)

type BalanceOperation struct {
	EntryType      BalanceEntryType
	AmountMinor    int64
	SourceType     string
	SourceID       string
	IdempotencyKey string
	Metadata       map[string]any
}

type BalanceSnapshot struct {
	AvailableMinor int64 `json:"available_minor"`
	HeldMinor      int64 `json:"held_minor"`
}

type BalanceEntry struct {
	AccountID      string
	EntryType      BalanceEntryType
	AmountMinor    int64
	SourceType     string
	SourceID       string
	IdempotencyKey string
}

var (
	ErrBalanceInsufficient     = errors.New("insufficient available balance")
	ErrBalanceHeldInsufficient = errors.New("insufficient held balance")
	ErrBalanceIdempotencyReuse = errors.New("balance idempotency key was reused with different operation")
)

// ValidateBalanceOperation keeps promotional liability separate from cash
// balances. Persistence must still use a transaction and unique idempotency
// key when applying the operation.
func ValidateBalanceOperation(balanceType BalanceType, entryType string, amountMinor int64) error {
	if amountMinor <= 0 {
		return errors.New("balance amount must be positive")
	}
	if balanceType == BalancePromotional && (entryType == "WITHDRAW" || entryType == "DISBURSE") {
		return ErrPromotionalBalanceNotWithdrawable
	}
	if entryType == "WITHDRAW" || entryType == "DISBURSE" {
		return nil
	}
	switch BalanceEntryType(entryType) {
	case BalanceCredit, BalanceDebit, BalanceHold, BalanceRelease, BalanceSettle, BalanceReversal:
		return nil
	default:
		return fmt.Errorf("unsupported balance entry type %q", entryType)
	}
}

// ApplyBalanceOperation applies one append-only operation to a current
// snapshot. HOLD removes funds from available and places them in held; RELEASE
// returns held funds to available; SETTLE consumes held funds without making
// them available again. The persisted repository serializes this transition
// with a database row lock.
func ApplyBalanceOperation(snapshot BalanceSnapshot, operation BalanceOperation) (BalanceSnapshot, error) {
	if operation.AmountMinor <= 0 {
		return snapshot, errors.New("balance amount must be positive")
	}
	switch operation.EntryType {
	case BalanceCredit, BalanceReversal:
		snapshot.AvailableMinor += operation.AmountMinor
	case BalanceDebit:
		if snapshot.AvailableMinor < operation.AmountMinor {
			return snapshot, ErrBalanceInsufficient
		}
		snapshot.AvailableMinor -= operation.AmountMinor
	case BalanceHold:
		if snapshot.AvailableMinor < operation.AmountMinor {
			return snapshot, ErrBalanceInsufficient
		}
		snapshot.AvailableMinor -= operation.AmountMinor
		snapshot.HeldMinor += operation.AmountMinor
	case BalanceRelease, BalanceSettle:
		if snapshot.HeldMinor < operation.AmountMinor {
			return snapshot, ErrBalanceHeldInsufficient
		}
		snapshot.HeldMinor -= operation.AmountMinor
		if operation.EntryType == BalanceRelease {
			snapshot.AvailableMinor += operation.AmountMinor
		}
	default:
		return snapshot, fmt.Errorf("unsupported balance entry type %q", operation.EntryType)
	}
	return snapshot, nil
}

// BalanceBook is a deterministic concurrency model used by unit tests and
// local simulations. Production writes use the same transition function under
// a PostgreSQL row lock.
type BalanceBook struct {
	mu      sync.Mutex
	entries map[string][]BalanceEntry
	seen    map[string]BalanceEntry
}

func NewBalanceBook() *BalanceBook {
	return &BalanceBook{entries: make(map[string][]BalanceEntry), seen: make(map[string]BalanceEntry)}
}

func (b *BalanceBook) Snapshot(accountID string) (BalanceSnapshot, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return calculateBalanceSnapshot(b.entries[accountID])
}

func (b *BalanceBook) Apply(accountID string, operation BalanceOperation) (BalanceSnapshot, bool, error) {
	if accountID == "" || operation.IdempotencyKey == "" {
		return BalanceSnapshot{}, false, errors.New("account and idempotency key are required")
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	if existing, ok := b.seen[operation.IdempotencyKey]; ok {
		if existing.AccountID != accountID {
			return BalanceSnapshot{}, false, ErrBalanceIdempotencyReuse
		}
		if existing.EntryType != operation.EntryType || existing.AmountMinor != operation.AmountMinor || existing.SourceType != operation.SourceType || existing.SourceID != operation.SourceID {
			return BalanceSnapshot{}, false, ErrBalanceIdempotencyReuse
		}
		snapshot, err := calculateBalanceSnapshot(b.entries[accountID])
		return snapshot, true, err
	}
	snapshot, err := calculateBalanceSnapshot(b.entries[accountID])
	if err != nil {
		return BalanceSnapshot{}, false, err
	}
	next, err := ApplyBalanceOperation(snapshot, operation)
	if err != nil {
		return snapshot, false, err
	}
	entry := BalanceEntry{AccountID: accountID, EntryType: operation.EntryType, AmountMinor: operation.AmountMinor, SourceType: operation.SourceType, SourceID: operation.SourceID, IdempotencyKey: operation.IdempotencyKey}
	b.entries[accountID] = append(b.entries[accountID], entry)
	b.seen[operation.IdempotencyKey] = entry
	return next, false, nil
}

func calculateBalanceSnapshot(entries []BalanceEntry) (BalanceSnapshot, error) {
	snapshot := BalanceSnapshot{}
	for _, entry := range entries {
		var err error
		snapshot, err = ApplyBalanceOperation(snapshot, BalanceOperation{EntryType: entry.EntryType, AmountMinor: entry.AmountMinor})
		if err != nil {
			return BalanceSnapshot{}, err
		}
	}
	return snapshot, nil
}
