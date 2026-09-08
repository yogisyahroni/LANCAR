package repository

import (
	"context"
	"database/sql"
	"os"
	"testing"

	"github.com/google/uuid"
	_ "github.com/lib/pq"
)

// Opt-in integration coverage proving branch deactivation is a checkout
// boundary: active branches are readable by order-service, inactive branches
// are not returned as new-order menu targets.
func TestMerchantBranchCheckoutBoundaryIntegration(t *testing.T) {
	dsn := os.Getenv("TEMBUS_MERCHANT_ENFORCEMENT_TEST_DATABASE_URL")
	merchantID := os.Getenv("TEMBUS_MERCHANT_ENFORCEMENT_TEST_MERCHANT_ID")
	if dsn == "" || merchantID == "" {
		t.Skip("requires TEMBUS_MERCHANT_ENFORCEMENT_TEST_DATABASE_URL and merchant fixture ID")
	}

	db, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Ping(); err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	branchID := uuid.NewString()
	itemID := uuid.NewString()
	t.Cleanup(func() {
		_, _ = db.ExecContext(ctx, `DELETE FROM merchant_menu_items WHERE id = $1`, itemID)
		_, _ = db.ExecContext(ctx, `DELETE FROM merchant_branches WHERE id = $1`, branchID)
		_ = db.Close()
	})

	if _, err := db.ExecContext(ctx, `
		INSERT INTO merchant_branches (id, merchant_id, code, name, address)
		VALUES ($1, $2, $3, 'Checkout Boundary Branch', 'Jakarta')`,
		branchID, merchantID, "CHK-"+branchID[:8]); err != nil {
		t.Fatalf("insert branch fixture: %v", err)
	}
	if _, err := db.ExecContext(ctx, `
		INSERT INTO merchant_menu_items (id, merchant_id, branch_id, nama, harga)
		VALUES ($1, $2, $3, 'Checkout Boundary Menu', 10000)`,
		itemID, merchantID, branchID); err != nil {
		t.Fatalf("insert menu fixture: %v", err)
	}

	foodRepo := NewFoodRepository(db, db, nil)
	items, err := foodRepo.GetFoodMenuItems(ctx, []string{itemID})
	if err != nil {
		t.Fatalf("read active branch menu: %v", err)
	}
	if len(items) != 1 || items[0].BranchID != branchID {
		t.Fatalf("active branch menu mismatch: %+v", items)
	}
	if _, err := db.ExecContext(ctx, `UPDATE merchant_branches SET is_active = FALSE WHERE id = $1`, branchID); err != nil {
		t.Fatal(err)
	}
	items, err = foodRepo.GetFoodMenuItems(ctx, []string{itemID})
	if err != nil {
		t.Fatalf("read inactive branch menu: %v", err)
	}
	if len(items) != 0 {
		t.Fatalf("inactive branch must not be a new-order target: %+v", items)
	}
}
