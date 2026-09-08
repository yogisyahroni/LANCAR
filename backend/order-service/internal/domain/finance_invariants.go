package domain

import (
	"fmt"
	"math"
	"math/big"
)

// PaymentStatus is deliberately explicit because a paid payment may still be
// moving through refund or settlement. Handlers must not infer those states
// from order.status.
const (
	PaymentStatusRefunding PaymentStatus = "refunding"
	PaymentStatusRefunded  PaymentStatus = "refunded"
	PaymentStatusSettled   PaymentStatus = "settled"
)

// ValidatePaymentTransition rejects resurrection of terminal financial state.
// Repeated delivery of the same provider event is idempotent.
func ValidatePaymentTransition(from, to PaymentStatus) error {
	if from == to {
		return nil
	}
	if from == PaymentStatusSettled || from == PaymentStatusRefunded {
		return fmt.Errorf("payment terminal state %q cannot transition to %q", from, to)
	}

	allowed := map[PaymentStatus]map[PaymentStatus]bool{
		PaymentStatusPending: {
			PaymentStatusPaid: true, PaymentStatusFailed: true, PaymentStatusExpired: true,
		},
		PaymentStatusPaid: {
			PaymentStatusRefunding: true, PaymentStatusSettled: true,
		},
		PaymentStatusRefunding: {
			PaymentStatusRefunded: true, PaymentStatusFailed: true,
		},
		PaymentStatusFailed:  {},
		PaymentStatusExpired: {},
	}
	if allowed[from][to] {
		return nil
	}
	return fmt.Errorf("invalid payment transition %q -> %q", from, to)
}

// RefundStatusProcessing and RefundStatusRefunded are the canonical names for
// the lifecycle. RefundStatusProcessed remains supported for old rows and
// clients; new code should use RefundStatusRefunded.
const (
	RefundStatusProcessing RefundStatus = "processing"
	RefundStatusRefunded   RefundStatus = "refunded"
)

func ValidateRefundTransition(from, to RefundStatus) error {
	if from == to {
		return nil
	}
	if from == RefundStatusRefunded {
		return fmt.Errorf("refund terminal state cannot transition to %q", to)
	}
	allowed := map[RefundStatus]map[RefundStatus]bool{
		RefundStatusPending: {
			RefundStatusProcessing: true, RefundStatusProcessed: true, RefundStatusRefunded: true,
			RefundStatusFailed: true,
		},
		RefundStatusProcessing: {
			RefundStatusProcessed: true, RefundStatusRefunded: true, RefundStatusFailed: true,
		},
		RefundStatusProcessed: {},
		RefundStatusFailed:    {RefundStatusPending: true},
	}
	if allowed[from][to] {
		return nil
	}
	return fmt.Errorf("invalid refund transition %q -> %q", from, to)
}

// ValidateLedgerEntries enforces double-entry invariants before persistence.
// Corrections must be represented by a new reversal journal, never mutation.
func ValidateLedgerEntries(entries []LedgerEntry) error {
	if len(entries) == 0 {
		return fmt.Errorf("ledger journal requires at least one entry")
	}
	var debit, credit int64
	currency := ""
	minorUnit := 0
	for _, entry := range entries {
		entryCurrency := entry.Currency
		if entryCurrency == "" {
			entryCurrency = "IDR"
		}
		code, expectedMinorUnit, err := NormalizeCurrency(entryCurrency)
		if err != nil {
			return fmt.Errorf("ledger entry %q has invalid currency: %w", entry.AccountName, err)
		}
		if currency == "" {
			currency, minorUnit = code, expectedMinorUnit
		} else if currency != code || minorUnit != expectedMinorUnit {
			return fmt.Errorf("ledger journal cannot mix currencies")
		}
		debitAmount, creditAmount := entry.DebitMinor, entry.CreditMinor
		if code == "IDR" {
			if debitAmount == 0 {
				debitAmount = entry.DebitIDR
			}
			if creditAmount == 0 {
				creditAmount = entry.CreditIDR
			}
		}
		if debitAmount < 0 || creditAmount < 0 {
			return fmt.Errorf("ledger entry %q contains a negative amount", entry.AccountName)
		}
		if debitAmount == 0 && creditAmount == 0 {
			return fmt.Errorf("ledger entry %q cannot have zero debit and credit", entry.AccountName)
		}
		if debitAmount > 0 && creditAmount > 0 {
			return fmt.Errorf("ledger entry %q cannot contain both debit and credit", entry.AccountName)
		}
		if debitAmount > math.MaxInt64-debit || creditAmount > math.MaxInt64-credit {
			return fmt.Errorf("ledger journal amount overflow")
		}
		debit += debitAmount
		credit += creditAmount
	}
	if debit != credit {
		return fmt.Errorf("unbalanced ledger journal: debit=%d credit=%d", debit, credit)
	}
	return nil
}

// ValidateLedgerJournalMoney adds the journal-level currency invariant to
// ValidateLedgerEntries. A balanced set of entries is still invalid when it
// is attached to a journal with a different currency context.
func ValidateLedgerJournalMoney(journal *LedgerJournal, entries []LedgerEntry) error {
	if journal == nil {
		return fmt.Errorf("ledger journal is required")
	}
	if err := ValidateLedgerEntries(entries); err != nil {
		return err
	}
	journalCurrency := journal.Currency
	if journalCurrency == "" {
		journalCurrency = "IDR"
	}
	code, minorUnit, err := NormalizeCurrency(journalCurrency)
	if err != nil {
		return fmt.Errorf("ledger journal has invalid currency: %w", err)
	}
	if journal.CurrencyMinorUnit != minorUnit {
		return fmt.Errorf("ledger journal currency metadata mismatch: %s/%d", journal.Currency, journal.CurrencyMinorUnit)
	}
	for _, entry := range entries {
		entryCurrency := entry.Currency
		if entryCurrency == "" {
			entryCurrency = "IDR"
		}
		entryCode, entryMinorUnit, err := NormalizeCurrency(entryCurrency)
		if err != nil {
			return fmt.Errorf("ledger entry %q has invalid currency: %w", entry.AccountName, err)
		}
		if entryCode != code || entryMinorUnit != minorUnit {
			return fmt.Errorf("ledger journal currency %s does not match entry currency %s", code, entryCode)
		}
	}
	return nil
}

type ReconciliationComponent struct {
	Name          string `json:"name"`
	ExpectedIDR   int64  `json:"expected_idr"`
	ActualIDR     int64  `json:"actual_idr"`
	DifferenceIDR int64  `json:"difference_idr"`
	Status        string `json:"status"`
}

func NewReconciliationComponent(name string, expected, actual int64) ReconciliationComponent {
	difference := actual - expected
	status := "matched"
	if difference != 0 {
		status = "mismatched"
	}
	return ReconciliationComponent{
		Name: name, ExpectedIDR: expected, ActualIDR: actual,
		DifferenceIDR: difference, Status: status,
	}
}

// ReconciliationMoneyComponent prevents reconciliation from subtracting
// amounts that happen to have the same numeric value but different currency
// semantics. Expected and actual values must carry the same ISO-4217 context.
type ReconciliationMoneyComponent struct {
	Name            string `json:"name"`
	Currency        string `json:"currency"`
	MinorUnit       int    `json:"minor_unit"`
	ExpectedMinor   int64  `json:"expected_minor"`
	ActualMinor     int64  `json:"actual_minor"`
	DifferenceMinor int64  `json:"difference_minor"`
	Status          string `json:"status"`
}

func NewMoneyReconciliationComponent(name string, expected, actual Money) (ReconciliationMoneyComponent, error) {
	if err := expected.Validate(); err != nil {
		return ReconciliationMoneyComponent{}, fmt.Errorf("invalid expected amount: %w", err)
	}
	if err := actual.Validate(); err != nil {
		return ReconciliationMoneyComponent{}, fmt.Errorf("invalid actual amount: %w", err)
	}
	if expected.Currency != actual.Currency || expected.MinorUnit != actual.MinorUnit {
		return ReconciliationMoneyComponent{}, fmt.Errorf("cannot reconcile %s against %s without explicit FX conversion", expected.Currency, actual.Currency)
	}
	difference := new(big.Int).Sub(big.NewInt(actual.AmountMinor), big.NewInt(expected.AmountMinor))
	if !difference.IsInt64() {
		return ReconciliationMoneyComponent{}, fmt.Errorf("reconciliation difference overflow")
	}
	status := "matched"
	if difference.Sign() != 0 {
		status = "mismatched"
	}
	return ReconciliationMoneyComponent{
		Name:            name,
		Currency:        expected.Currency,
		MinorUnit:       expected.MinorUnit,
		ExpectedMinor:   expected.AmountMinor,
		ActualMinor:     actual.AmountMinor,
		DifferenceMinor: difference.Int64(),
		Status:          status,
	}, nil
}
