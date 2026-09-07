package domain

import (
	"errors"
	"testing"
	"time"
)

func TestResolveFoodPickupWait(t *testing.T) {
	now := time.Date(2026, 9, 7, 12, 0, 0, 0, time.UTC)
	arrived := now.Add(-7 * time.Minute)
	ready := now.Add(3 * time.Minute)

	if got := ResolveFoodPickupWait(StatusSearching, &ready, &arrived, now); got.State != FoodPickupReady || got.WaitSeconds != 420 {
		t.Fatalf("searching should emit ready with seven-minute wait: %+v", got)
	}
	if got := ResolveFoodPickupWait(StatusPreparing, &ready, &arrived, now); got.State != FoodPickupWaitingForReady || got.WaitSeconds != 420 {
		t.Fatalf("preparing should remain waiting for ready: %+v", got)
	}
	if got := ResolveFoodPickupWait(StatusPreparing, &ready, nil, now); got.State != FoodPickupWaitingForArrival || got.WaitSeconds != 0 {
		t.Fatalf("missing arrival must not start timer: %+v", got)
	}
	if got := ResolveFoodPickupWait(StatusPickedUp, &ready, &arrived, now); got.State != FoodPickupPickedUp {
		t.Fatalf("picked up should close wait lifecycle: %+v", got)
	}
}

func TestValidateFoodPickupIssue(t *testing.T) {
	for _, code := range []FoodPickupIssueCode{FoodPickupIssueNotReady, FoodPickupIssuePartial, FoodPickupIssueMerchantLate} {
		if err := ValidateFoodPickupIssue(code, "merchant belum siap"); err != nil {
			t.Fatalf("valid issue %s rejected: %v", code, err)
		}
	}
	if err := ValidateFoodPickupIssue("unknown", "merchant belum siap"); !errors.Is(err, ErrInvalidFoodPickupIssue) {
		t.Fatalf("unknown issue should be rejected: %v", err)
	}
	if err := ValidateFoodPickupIssue(FoodPickupIssueNotReady, "short"); !errors.Is(err, ErrInvalidFoodPickupIssue) {
		t.Fatalf("short evidence should be rejected: %v", err)
	}
}
