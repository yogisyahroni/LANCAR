package domain

import "testing"

func TestCompareReconciliationQueuesMissingAndMismatchWithoutRewritingHistory(t *testing.T) {
	internal := &ReconciliationRecord{IntentID: "intent-1", Provider: "unassigned", AmountMinor: 1000, Currency: "IDR", State: PaymentIntentPaid}
	exceptions, err := CompareReconciliation(internal, &ReconciliationRecord{IntentID: "intent-1", ProviderReference: "native-1", AmountMinor: 900, Currency: "USD"}, nil)
	if err != nil || len(exceptions) != 3 {
		t.Fatalf("expected amount, currency, and settlement exceptions, got %v/%v", exceptions, err)
	}
	if internal.AmountMinor != 1000 || internal.Currency != "IDR" {
		t.Fatal("reconciliation must not mutate the internal truth")
	}
}

func TestCompareReconciliationDetectsMissingProvider(t *testing.T) {
	exceptions, err := CompareReconciliation(&ReconciliationRecord{IntentID: "intent-1"}, nil, nil)
	if err != nil || len(exceptions) != 1 || exceptions[0].Type != "MISSING_PROVIDER" {
		t.Fatalf("expected missing provider exception, got %v/%v", exceptions, err)
	}
}

func TestCompareReconciliationIgnoresProviderBatchTimezoneDifferences(t *testing.T) {
	internal := &ReconciliationRecord{IntentID: "intent-2", Provider: "provider-a", ProviderReference: "native-2", AmountMinor: 1000, Currency: "IDR", State: PaymentIntentPaid, BatchDate: "2026-09-14", Timezone: "Asia/Jakarta"}
	provider := &ReconciliationRecord{IntentID: "intent-2", Provider: "provider-a", ProviderReference: "native-2", AmountMinor: 1000, Currency: "IDR", State: PaymentIntentPaid, BatchDate: "2026-09-13", Timezone: "UTC"}
	settlement := &ReconciliationRecord{IntentID: "intent-2", Provider: "provider-a", ProviderReference: "native-2", AmountMinor: 1000, Currency: "IDR", State: PaymentIntentPaid, BatchDate: "2026-09-13", Timezone: "UTC"}
	exceptions, err := CompareReconciliation(internal, provider, settlement)
	if err != nil || len(exceptions) != 0 {
		t.Fatalf("batch cut-off metadata must not create a financial mismatch, got %v/%v", exceptions, err)
	}
}
