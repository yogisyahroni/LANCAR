package repository

import (
	"context"
	"database/sql"
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/lib/pq"
	"tembus/merchant-service/internal/domain"
)

// Opt-in integration coverage for the local PostgreSQL database. It proves
// all enforcement scopes, the active-order safe-completion transition, the
// merchant-facing repository contract, and the appeal uniqueness invariant.
func TestMerchantEnforcementIntegration(t *testing.T) {
	dsn := os.Getenv("TEMBUS_MERCHANT_ENFORCEMENT_TEST_DATABASE_URL")
	merchantID := os.Getenv("TEMBUS_MERCHANT_ENFORCEMENT_TEST_MERCHANT_ID")
	actorID := os.Getenv("TEMBUS_MERCHANT_ENFORCEMENT_TEST_USER_ID")
	if dsn == "" || merchantID == "" || actorID == "" {
		t.Skip("requires TEMBUS_MERCHANT_ENFORCEMENT_TEST_DATABASE_URL, merchant and owner fixture IDs")
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
	orderID := uuid.NewString()
	orderItemID := uuid.NewString()
	actionIDs := []string{uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString()}

	t.Cleanup(func() {
		_, _ = db.ExecContext(ctx, `DELETE FROM merchant_enforcement_actions WHERE id = ANY($1::uuid[])`, pq.Array(actionIDs))
		_, _ = db.ExecContext(ctx, `DELETE FROM food_order_items WHERE id = $1`, orderItemID)
		_, _ = db.ExecContext(ctx, `DELETE FROM orders WHERE id = $1`, orderID)
		_, _ = db.ExecContext(ctx, `DELETE FROM merchant_menu_items WHERE id = $1`, itemID)
		_, _ = db.ExecContext(ctx, `DELETE FROM merchant_branches WHERE id = $1`, branchID)
		_ = db.Close()
	})

	if _, err := db.ExecContext(ctx, `
		INSERT INTO merchant_branches (id, merchant_id, code, name, address)
		VALUES ($1, $2, $3, 'Enforcement Integration Branch', 'Jakarta')`,
		branchID, merchantID, "ENF-"+branchID[:8]); err != nil {
		t.Fatalf("insert branch fixture: %v", err)
	}
	if _, err := db.ExecContext(ctx, `
		INSERT INTO merchant_menu_items (id, merchant_id, branch_id, nama, harga)
		VALUES ($1, $2, $3, 'Enforcement Integration Menu', 25000)`,
		itemID, merchantID, branchID); err != nil {
		t.Fatalf("insert menu fixture: %v", err)
	}
	if _, err := db.ExecContext(ctx, `
		INSERT INTO orders
			(id, order_number, customer_id, merchant_id, model, status,
			 pickup_location, pickup_address, dropoff_location, dropoff_address,
			 base_price_idr, total_price_idr, ppn_idr, mdr_idr,
			 service_category, service_sub_type, service_code)
		VALUES ($1, $2, $3, $4, 'p2p', 'preparing',
			 ST_SetSRID(ST_MakePoint(106.8, -6.2), 4326), 'merchant pickup',
			 ST_SetSRID(ST_MakePoint(106.81, -6.21), 4326), 'customer dropoff',
			 25000, 25000, 0, 0, 'food', 'food_delivery', 'food_delivery')`,
		orderID, "enf-"+orderID[:20], actorID, merchantID); err != nil {
		t.Fatalf("insert active food order fixture: %v", err)
	}
	if _, err := db.ExecContext(ctx, `
		INSERT INTO food_order_items (id, order_id, menu_item_id, item_name, item_price, quantity, subtotal)
		VALUES ($1, $2, $3, 'Enforcement Integration Menu', 25000, 1, 25000)`,
		orderItemID, orderID, itemID); err != nil {
		t.Fatalf("insert food order item fixture: %v", err)
	}

	// The merchant, branch, item, and Ads overlays are separate scopes and
	// each remains queryable through the same server-authoritative function.
	actionArgs := []struct {
		id, scope, branch, item, capability string
	}{
		{actionIDs[0], "merchant", "", "", ""},
		{actionIDs[1], "branch", branchID, "", ""},
		{actionIDs[2], "item", "", itemID, ""},
		{actionIDs[3], "ads", "", "", "ads"},
	}
	for _, action := range actionArgs {
		if _, err := db.ExecContext(ctx, `
			INSERT INTO merchant_enforcement_actions
				(id, merchant_id, scope, target_branch_id, target_menu_item_id, capability,
				 reason_category, reason_detail, evidence, merchant_message, remediation_message,
				 effective_from, safe_order_policy, status, created_by)
			VALUES ($1, $2, $3, NULLIF($4, '')::uuid, NULLIF($5, '')::uuid, NULLIF($6, ''),
				 'safety', 'Integration policy evidence requires safe remediation.',
				 '{"source":"integration"}'::jsonb, 'Review required before new orders.',
				 'Follow the remediation checklist and appeal if needed.',
				 NOW(), 'allow_active_order_completion', 'active', $7)`,
			action.id, merchantID, action.scope, action.branch, action.item, action.capability, actorID); err != nil {
			t.Fatalf("insert %s enforcement fixture: %v", action.scope, err)
		}
	}

	var merchantActive, branchActive, itemActive, adsActive bool
	if err := db.QueryRowContext(ctx, `
		SELECT merchant_enforcement_is_active($1, NULL, NULL, NULL),
		       merchant_enforcement_is_active($1, $2, NULL, NULL),
		       merchant_enforcement_is_active($1, NULL, $3, NULL),
		       merchant_enforcement_is_active($1, NULL, NULL, 'ads')`,
		merchantID, branchID, itemID).Scan(&merchantActive, &branchActive, &itemActive, &adsActive); err != nil {
		t.Fatalf("evaluate enforcement scopes: %v", err)
	}
	if !merchantActive || !branchActive || !itemActive || !adsActive {
		t.Fatalf("all enforcement scopes must be active: merchant=%t branch=%t item=%t ads=%t", merchantActive, branchActive, itemActive, adsActive)
	}

	// A due merchant action must wait while the active food order is still
	// being fulfilled, without mutating the order or financial state.
	if _, err := db.ExecContext(ctx, `
		UPDATE merchant_enforcement_actions
		SET status = 'scheduled', effective_from = NOW() - INTERVAL '1 minute'
		WHERE id = $1`, actionIDs[0]); err != nil {
		t.Fatal(err)
	}
	var changed int
	if err := db.QueryRowContext(ctx, `SELECT refresh_merchant_enforcement_actions()`).Scan(&changed); err != nil {
		t.Fatalf("refresh safe completion: %v", err)
	}
	if changed != 1 {
		t.Fatalf("expected one action transition, changed=%d", changed)
	}
	var status string
	var activeOrderCount int
	if err := db.QueryRowContext(ctx, `SELECT status FROM merchant_enforcement_actions WHERE id = $1`, actionIDs[0]).Scan(&status); err != nil {
		t.Fatal(err)
	}
	if status != "pending_safe_completion" {
		t.Fatalf("active order must defer enforcement activation, got %s", status)
	}
	if err := db.QueryRowContext(ctx, `
		SELECT COUNT(*)::int FROM orders order_row
		WHERE merchant_enforcement_order_matches(
			(SELECT action FROM merchant_enforcement_actions action WHERE action.id = $1), order_row.id)`, actionIDs[0]).Scan(&activeOrderCount); err != nil {
		t.Fatalf("count matching active order: %v", err)
	}
	if activeOrderCount != 1 {
		t.Fatalf("expected active order to remain matched, got %d", activeOrderCount)
	}

	// Branch lifecycle is guarded by the same active-order boundary: a
	// merchant cannot strand the order by deactivating its branch.
	deactivateBranch := false
	accessRepo := NewPostgresMerchantAccessRepository(db, db)
	if err := accessRepo.UpdateBranch(ctx, merchantID, branchID, domain.UpdateMerchantBranchRequest{IsActive: &deactivateBranch}); err == nil {
		t.Fatal("branch deactivation must be rejected while the active food order exists")
	}

	repo, ok := NewPostgresMerchantRepository(db, db).(domain.MerchantEnforcementRepository)
	if !ok {
		t.Fatal("postgres merchant repository does not implement enforcement repository")
	}
	if err := repo.Refresh(ctx); err != nil {
		t.Fatalf("repository refresh: %v", err)
	}
	merchantStatus, err := repo.GetForMerchant(ctx, merchantID)
	if err != nil {
		t.Fatalf("merchant enforcement status: %v", err)
	}
	if !merchantStatus.ServerTruth || len(merchantStatus.Actions) != 4 {
		t.Fatalf("unexpected merchant status: server_truth=%t actions=%d", merchantStatus.ServerTruth, len(merchantStatus.Actions))
	}
	appeal, err := repo.SubmitAppeal(ctx, merchantID, actionIDs[0], "Evidence has been remediated and the active order should complete safely.")
	if err != nil {
		t.Fatalf("submit enforcement appeal: %v", err)
	}
	if appeal.Status != "submitted" {
		t.Fatalf("expected submitted appeal, got %s", appeal.Status)
	}
	if _, err := repo.SubmitAppeal(ctx, merchantID, actionIDs[0], "Duplicate appeal must be rejected by the open appeal invariant."); err == nil {
		t.Fatal("open enforcement appeal should be unique")
	}

	if _, err := db.ExecContext(ctx, `DELETE FROM food_order_items WHERE id = $1`, orderItemID); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `DELETE FROM orders WHERE id = $1`, orderID); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRowContext(ctx, `SELECT refresh_merchant_enforcement_actions()`).Scan(&changed); err != nil {
		t.Fatalf("refresh after active order completion: %v", err)
	}
	if err := db.QueryRowContext(ctx, `SELECT status FROM merchant_enforcement_actions WHERE id = $1`, actionIDs[0]).Scan(&status); err != nil {
		t.Fatal(err)
	}
	if status != "active" {
		t.Fatalf("deferred action should activate after order completion, got %s", status)
	}
	if err := accessRepo.UpdateBranch(ctx, merchantID, branchID, domain.UpdateMerchantBranchRequest{IsActive: &deactivateBranch}); err != nil {
		t.Fatalf("branch should deactivate after active order completion: %v", err)
	}
	var isBranchActive bool
	if err := db.QueryRowContext(ctx, `SELECT is_active FROM merchant_branches WHERE id = $1`, branchID).Scan(&isBranchActive); err != nil {
		t.Fatal(err)
	}
	if isBranchActive {
		t.Fatal("branch deactivation was not persisted")
	}
}
