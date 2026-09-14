package repository

import (
	"context"
	"database/sql"
	"os"
	"testing"

	"github.com/google/uuid"
	_ "github.com/lib/pq"
)

func TestFoodMembershipPaymentLifecycleAgainstStagingSchema(t *testing.T) {
	dsn := os.Getenv("TEMBUS_ORDER_SERVICE_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEMBUS_ORDER_SERVICE_TEST_DATABASE_URL is not configured")
	}
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err := db.PingContext(context.Background()); err != nil {
		t.Fatal(err)
	}

	const userID = "f567a612-8272-4c04-b42b-8f1f80817018"
	const planID = "f7ee8ae9-9983-4768-b9a2-b6ac9a76336c"
	const orderID = "b29b0680-d355-4c96-ada8-d9ce9d05de21"
	key := "staging-membership-" + uuid.NewString()
	intentID := uuid.NewString()
	repo := NewFoodMembershipRepository(db)

	entitlement, err := repo.CreatePendingFoodMembership(context.Background(), userID, planID, key)
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		_, _ = db.Exec(`DELETE FROM food_membership_subsidy_ledger WHERE entitlement_id = $1::uuid`, entitlement.ID)
		_, _ = db.Exec(`DELETE FROM food_membership_payment_events WHERE entitlement_id = $1::uuid`, entitlement.ID)
		_, _ = db.Exec(`DELETE FROM food_membership_entitlements WHERE id = $1::uuid`, entitlement.ID)
	}()

	active, err := repo.ApplyFoodMembershipPaymentEvent(context.Background(), entitlement.ID, "SUCCEEDED", intentID, "provider-staging-1", key+"-success")
	if err != nil {
		t.Fatal(err)
	}
	if active.Status != "active" || active.CurrentPeriodEnd.IsZero() || active.CurrentPeriodEnd.Before(active.CurrentPeriodStart) {
		t.Fatalf("expected active entitlement with a valid period, got %+v", active)
	}
	renewed, err := repo.ApplyFoodMembershipPaymentEvent(context.Background(), entitlement.ID, "SUCCEEDED", intentID, "provider-staging-renewal", key+"-renewal")
	if err != nil {
		t.Fatal(err)
	}
	if !renewed.CurrentPeriodEnd.After(active.CurrentPeriodEnd) {
		t.Fatalf("successful renewal must extend the active period: before=%s after=%s", active.CurrentPeriodEnd, renewed.CurrentPeriodEnd)
	}
	if err := repo.RecordFoodMembershipSubsidy(context.Background(), entitlement.ID, orderID, 1); err != nil {
		t.Fatal(err)
	}
	activeAfterSubsidy, _, err := repo.GetActiveFoodMembership(context.Background(), userID)
	if err != nil {
		t.Fatal(err)
	}
	if activeAfterSubsidy == nil || activeAfterSubsidy.FreeDeliveryUsedIDR != 1 {
		t.Fatalf("expected one authoritative subsidy ledger unit, got %+v", activeAfterSubsidy)
	}

	duplicate, err := repo.ApplyFoodMembershipPaymentEvent(context.Background(), entitlement.ID, "SUCCEEDED", intentID, "provider-staging-1", key+"-success")
	if err != nil {
		t.Fatal(err)
	}
	if duplicate.Status != "active" {
		t.Fatalf("same event replay changed entitlement: %+v", duplicate)
	}

	if _, err := repo.ApplyFoodMembershipPaymentEvent(context.Background(), entitlement.ID, "REFUNDED", intentID, "provider-staging-2", key+"-success"); err == nil {
		t.Fatal("expected idempotency-key reuse with different payment result to fail")
	}

	grace, err := repo.ApplyFoodMembershipPaymentEvent(context.Background(), entitlement.ID, "FAILED", intentID, "provider-staging-3", key+"-failed")
	if err != nil {
		t.Fatal(err)
	}
	if grace.Status != "grace" {
		t.Fatalf("expected active payment failure to enter grace, got %+v", grace)
	}

	refunded, err := repo.ApplyFoodMembershipPaymentEvent(context.Background(), entitlement.ID, "REFUNDED", intentID, "provider-staging-4", key+"-refunded")
	if err != nil {
		t.Fatal(err)
	}
	if refunded.Status != "refunded" {
		t.Fatalf("expected refund to become terminal refunded, got %+v", refunded)
	}
	if activeAfterRefund, _, err := repo.GetActiveFoodMembership(context.Background(), userID); err != nil {
		t.Fatal(err)
	} else if activeAfterRefund != nil {
		t.Fatalf("refunded entitlement must not remain eligible: %+v", activeAfterRefund)
	}
}
