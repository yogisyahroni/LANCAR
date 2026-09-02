package domain

import "fmt"

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
	for _, entry := range entries {
		if entry.DebitIDR < 0 || entry.CreditIDR < 0 {
			return fmt.Errorf("ledger entry %q contains a negative amount", entry.AccountName)
		}
		if entry.DebitIDR == 0 && entry.CreditIDR == 0 {
			return fmt.Errorf("ledger entry %q cannot have zero debit and credit", entry.AccountName)
		}
		if entry.DebitIDR > 0 && entry.CreditIDR > 0 {
			return fmt.Errorf("ledger entry %q cannot contain both debit and credit", entry.AccountName)
		}
		debit += entry.DebitIDR
		credit += entry.CreditIDR
	}
	if debit != credit {
		return fmt.Errorf("unbalanced ledger journal: debit=%d credit=%d", debit, credit)
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
