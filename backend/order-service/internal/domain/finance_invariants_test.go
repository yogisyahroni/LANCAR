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

func TestValidateLedgerJournalMoneyRequiresMatchingCurrencyContext(t *testing.T) {
	journal := &LedgerJournal{Currency: "USD", CurrencyMinorUnit: 2}
	entries := []LedgerEntry{
		{AccountName: "cash", Currency: "USD", CurrencyMinorUnit: 2, DebitMinor: 1250},
		{AccountName: "revenue", Currency: "USD", CurrencyMinorUnit: 2, CreditMinor: 1250},
	}
	if err := ValidateLedgerJournalMoney(journal, entries); err != nil {
		t.Fatalf("valid USD journal rejected: %v", err)
	}
	entries[1].Currency = "IDR"
	entries[1].CurrencyMinorUnit = 0
	if err := ValidateLedgerJournalMoney(journal, entries); err == nil {
		t.Fatal("mixed-currency ledger journal accepted")
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

func TestNewMoneyReconciliationComponentRejectsCrossCurrency(t *testing.T) {
	usd, err := NewMoney("USD", 1000)
	if err != nil {
		t.Fatal(err)
	}
	idr, err := NewMoney("IDR", 1000)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := NewMoneyReconciliationComponent("settlement", usd, idr); err == nil {
		t.Fatal("cross-currency reconciliation accepted")
	}
}
