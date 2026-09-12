package service

import (
	"context"
	"testing"

	"tembus/payment-service/internal/domain"
)

type reconciliationStoreStub struct {
	exceptions []domain.ReconciliationException
}

func (s *reconciliationStoreStub) RecordException(_ context.Context, _ *domain.ReconciliationRecord, _ *domain.ReconciliationRecord, _ *domain.ReconciliationRecord, exception domain.ReconciliationException) error {
	s.exceptions = append(s.exceptions, exception)
	return nil
}

func TestReconciliationServicePersistsEachExceptionWithoutMutatingRecords(t *testing.T) {
	store := &reconciliationStoreStub{}
	svc := NewReconciliationService(store)
	internal := &domain.ReconciliationRecord{IntentID: "intent-1", Provider: "provider-a", AmountMinor: 1000, Currency: "IDR", State: domain.PaymentIntentPaid, BatchDate: "2026-09-12", Timezone: "Asia/Jakarta"}
	provider := &domain.ReconciliationRecord{IntentID: "intent-1", Provider: "provider-a", ProviderReference: "native-1", AmountMinor: 900, Currency: "USD", State: domain.PaymentIntentPaid, BatchDate: "2026-09-13", Timezone: "UTC"}
	settlement := &domain.ReconciliationRecord{IntentID: "intent-1", Provider: "provider-a", ProviderReference: "native-1", AmountMinor: 900, Currency: "USD", State: domain.PaymentIntentPaid, BatchDate: "2026-09-13", Timezone: "UTC"}
	exceptions, err := svc.Reconcile(context.Background(), internal, provider, settlement)
	if err != nil || len(exceptions) != 2 || len(store.exceptions) != 2 {
		t.Fatalf("expected amount and currency exceptions, got exceptions=%v stored=%v err=%v", exceptions, store.exceptions, err)
	}
	if internal.AmountMinor != 1000 || internal.Currency != "IDR" || internal.BatchDate != "2026-09-12" {
		t.Fatal("reconciliation mutated internal truth")
	}
}

func TestReconciliationServiceHasNoWriteOnCleanMatch(t *testing.T) {
	store := &reconciliationStoreStub{}
	svc := NewReconciliationService(store)
	record := &domain.ReconciliationRecord{IntentID: "intent-1", Provider: "provider-a", ProviderReference: "native-1", AmountMinor: 1000, Currency: "IDR", State: domain.PaymentIntentPaid}
	exceptions, err := svc.Reconcile(context.Background(), record, record, record)
	if err != nil || len(exceptions) != 0 || len(store.exceptions) != 0 {
		t.Fatalf("expected clean reconciliation, got exceptions=%v stored=%v err=%v", exceptions, store.exceptions, err)
	}
}
