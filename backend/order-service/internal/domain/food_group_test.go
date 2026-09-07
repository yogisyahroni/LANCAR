package domain

import (
	"testing"
	"time"
)

func TestAllocateFoodGroupSplitExactWithRemainder(t *testing.T) {
	allocations, err := AllocateFoodGroupSplit(10001, []string{"creator", "member-a", "member-b"})
	if err != nil {
		t.Fatal(err)
	}
	if allocations[0].AmountIDR != 3334 || allocations[1].AmountIDR != 3334 || allocations[2].AmountIDR != 3333 {
		t.Fatalf("unexpected allocations: %+v", allocations)
	}
	var total int64
	for _, allocation := range allocations {
		total += allocation.AmountIDR
	}
	if total != 10001 {
		t.Fatalf("allocation total = %d, want 10001", total)
	}
}

func TestValidateFoodGroupWindow(t *testing.T) {
	now := time.Date(2026, 9, 7, 12, 0, 0, 0, time.UTC)
	if err := ValidateFoodGroupWindow(now.Add(6*time.Minute), now); err != nil {
		t.Fatal(err)
	}
	if err := ValidateFoodGroupWindow(now.Add(5*time.Minute), now); err == nil {
		t.Fatal("deadline at five minutes should be rejected")
	}
	if err := ValidateFoodGroupWindow(now.Add(25*time.Hour), now); err == nil {
		t.Fatal("deadline beyond 24 hours should be rejected")
	}
}
