package domain

import "testing"

func TestValidatePaymentTransition(t *testing.T) {
	tests := []struct {
		name string
		from PaymentStatus
		to   PaymentStatus
		want bool
	}{
		{"pending to paid", PaymentStatusPending, PaymentStatusPaid, true},
		{"paid to refunding", PaymentStatusPaid, PaymentStatusRefunding, true},
		{"same event idempotent", PaymentStatusPaid, PaymentStatusPaid, true},
		{"settled cannot resurrect", PaymentStatusSettled, PaymentStatusPending, false},
		{"failed cannot become paid", PaymentStatusFailed, PaymentStatusPaid, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := ValidatePaymentTransition(tt.from, tt.to) == nil; got != tt.want {
				t.Fatalf("transition %s -> %s valid=%v, want %v", tt.from, tt.to, got, tt.want)
			}
		})
	}
}

func TestValidateLedgerEntries(t *testing.T) {
	valid := []LedgerEntry{
		{AccountName: "cash", DebitIDR: 100},
		{AccountName: "revenue", CreditIDR: 100},
	}
	if err := ValidateLedgerEntries(valid); err != nil {
		t.Fatalf("valid journal rejected: %v", err)
	}
	if err := ValidateLedgerEntries([]LedgerEntry{{AccountName: "cash", DebitIDR: 100}}); err == nil {
		t.Fatal("unbalanced journal accepted")
	}
	if err := ValidateLedgerEntries([]LedgerEntry{{AccountName: "cash", DebitIDR: 1, CreditIDR: 1}}); err == nil {
		t.Fatal("entry with both sides accepted")
	}
}

func TestNewReconciliationComponent(t *testing.T) {
	matched := NewReconciliationComponent("payment", 100, 100)
	if matched.Status != "matched" || matched.DifferenceIDR != 0 {
		t.Fatalf("unexpected matched component: %#v", matched)
	}
	mismatch := NewReconciliationComponent("refund", 100, 80)
	if mismatch.Status != "mismatched" || mismatch.DifferenceIDR != -20 {
		t.Fatalf("unexpected mismatch component: %#v", mismatch)
	}
}
