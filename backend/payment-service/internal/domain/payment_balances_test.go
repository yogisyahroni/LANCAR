package domain

import (
	"errors"
	"sync"
	"testing"
)

func TestPromotionalCreditCannotBecomeWithdrawableCash(t *testing.T) {
	if err := ValidateBalanceOperation(BalancePromotional, "WITHDRAW", 100); err != ErrPromotionalBalanceNotWithdrawable {
		t.Fatalf("expected promotional credit withdrawal to be rejected, got %v", err)
	}
	if err := ValidateBalanceOperation(BalanceCourierEarnings, "DISBURSE", 100); err != nil {
		t.Fatalf("courier earnings should support disbursement: %v", err)
	}
}

func TestBalanceHoldReleaseAndSettleSemantics(t *testing.T) {
	snapshot, err := ApplyBalanceOperation(BalanceSnapshot{AvailableMinor: 1000}, BalanceOperation{EntryType: BalanceHold, AmountMinor: 400})
	if err != nil || snapshot.AvailableMinor != 600 || snapshot.HeldMinor != 400 {
		t.Fatalf("hold mismatch: %+v/%v", snapshot, err)
	}
	snapshot, err = ApplyBalanceOperation(snapshot, BalanceOperation{EntryType: BalanceRelease, AmountMinor: 150})
	if err != nil || snapshot.AvailableMinor != 750 || snapshot.HeldMinor != 250 {
		t.Fatalf("release mismatch: %+v/%v", snapshot, err)
	}
	snapshot, err = ApplyBalanceOperation(snapshot, BalanceOperation{EntryType: BalanceSettle, AmountMinor: 250})
	if err != nil || snapshot.AvailableMinor != 750 || snapshot.HeldMinor != 0 {
		t.Fatalf("settle mismatch: %+v/%v", snapshot, err)
	}
}

func TestBalanceBookConcurrentReservationsNeverOverdrawAndReplayIsIdempotent(t *testing.T) {
	book := NewBalanceBook()
	if _, _, err := book.Apply("customer-1", BalanceOperation{EntryType: BalanceCredit, AmountMinor: 1000, SourceType: "TEST", SourceID: "seed", IdempotencyKey: "seed"}); err != nil {
		t.Fatal(err)
	}
	if _, duplicate, err := book.Apply("customer-1", BalanceOperation{EntryType: BalanceHold, AmountMinor: 100, SourceType: "ORDER", SourceID: "a", IdempotencyKey: "hold-a"}); err != nil || duplicate {
		t.Fatalf("expected initial reservation, duplicate=%v err=%v", duplicate, err)
	}
	var wg sync.WaitGroup
	var mu sync.Mutex
	accepted := 0
	for i := 1; i < 20; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			_, _, err := book.Apply("customer-1", BalanceOperation{EntryType: BalanceHold, AmountMinor: 100, SourceType: "ORDER", SourceID: string(rune('a' + i)), IdempotencyKey: "hold-" + string(rune('a'+i))})
			if err == nil {
				mu.Lock()
				accepted++
				mu.Unlock()
			}
		}(i)
	}
	wg.Wait()
	if accepted != 9 {
		t.Fatalf("expected exactly nine concurrent reservations, got %d", accepted)
	}
	snapshot, err := book.Snapshot("customer-1")
	if err != nil || snapshot.AvailableMinor != 0 || snapshot.HeldMinor != 1000 {
		t.Fatalf("unexpected final snapshot: %+v/%v", snapshot, err)
	}
	_, duplicate, err := book.Apply("customer-1", BalanceOperation{EntryType: BalanceHold, AmountMinor: 100, SourceType: "ORDER", SourceID: "a", IdempotencyKey: "hold-a"})
	if err != nil || !duplicate {
		t.Fatalf("expected idempotent replay, duplicate=%v err=%v", duplicate, err)
	}
	_, _, err = book.Apply("customer-1", BalanceOperation{EntryType: BalanceHold, AmountMinor: 200, SourceType: "ORDER", SourceID: "different", IdempotencyKey: "hold-a"})
	if !errors.Is(err, ErrBalanceIdempotencyReuse) {
		t.Fatalf("expected idempotency reuse error, got %v", err)
	}
}
