package repository

import (
	"context"
	"database/sql"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	_ "github.com/lib/pq"
	"tembus/merchant-service/internal/domain"
	"tembus/merchant-service/internal/service"
)

// TestMerchantLifecycleReleaseGateIntegration is an opt-in local PostgreSQL
// gate for the merchant-side half of the end-to-end lifecycle. It deliberately
// uses the real repositories/service, while generated order/catalog/staff rows
// are removed during cleanup.
func TestMerchantLifecycleReleaseGateIntegration(t *testing.T) {
	dsn := strings.TrimSpace(getenv("TEMBUS_MERCHANT_LIFECYCLE_TEST_DATABASE_URL"))
	merchantID := strings.TrimSpace(getenv("TEMBUS_MERCHANT_LIFECYCLE_TEST_MERCHANT_ID"))
	ownerID := strings.TrimSpace(getenv("TEMBUS_MERCHANT_LIFECYCLE_TEST_OWNER_ID"))
	if dsn == "" || merchantID == "" || ownerID == "" {
		t.Skip("requires TEMBUS_MERCHANT_LIFECYCLE_TEST_DATABASE_URL, merchant and owner fixture IDs")
	}

	db, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatalf("open postgres: %v", err)
	}
	if err := db.PingContext(context.Background()); err != nil {
		db.Close()
		t.Fatalf("ping postgres: %v", err)
	}
	ctx := context.Background()
	merchantRepo := NewPostgresMerchantRepository(db, db)
	accessRepo := NewPostgresMerchantAccessRepository(db, db)
	menuRepo := NewPostgresMenuItemRepository(db, db)
	orderRepo := NewPostgresMerchantOrderRepository(db, db)
	reportRepo := NewPostgresReportRepository(db, db)
	merchantSvc := service.NewMerchantServiceWithGovernance(merchantRepo, menuRepo, orderRepo, reportRepo, accessRepo, menuRepo)

	merchant, err := merchantRepo.GetByID(ctx, merchantID)
	if err != nil {
		db.Close()
		t.Fatalf("load merchant fixture: %v", err)
	}
	if merchant == nil || merchant.UserID != ownerID || merchant.OnboardingStatus != "ACTIVE" || merchant.VerificationStatus != "approved" {
		db.Close()
		t.Fatalf("fixture is not an active verified merchant: %+v", merchant)
	}

	branches, err := accessRepo.ListBranches(ctx, merchantID)
	if err != nil || len(branches) == 0 {
		db.Close()
		t.Fatalf("branch setup is not readable: branches=%+v err=%v", branches, err)
	}
	var mainBranch *domain.MerchantBranch
	for _, branch := range branches {
		if branch.IsActive && branch.Code == "MAIN" {
			mainBranch = branch
			break
		}
	}
	if mainBranch == nil {
		t.Fatalf("active MAIN branch is required for the lifecycle fixture: %+v", branches)
	}

	itemID := uuid.NewString()
	orderID := uuid.NewString()
	orderItemID := uuid.NewString()
	staffID := uuid.NewString()
	staffUserID := ""
	deviceSessionID := ""
	deviceToken := "merchant-lifecycle-gate-" + uuid.NewString()

	cleanup := func() {
		if deviceSessionID != "" {
			_, _ = db.ExecContext(ctx, `DELETE FROM merchant_device_sessions WHERE id = $1`, deviceSessionID)
		}
		if staffID != "" {
			_, _ = db.ExecContext(ctx, `DELETE FROM merchant_staff_branch_access WHERE staff_id = $1`, staffID)
			_, _ = db.ExecContext(ctx, `DELETE FROM merchant_staff WHERE id = $1`, staffID)
		}
		if orderID != "" {
			_, _ = db.ExecContext(ctx, `DELETE FROM order_events WHERE order_id = $1`, orderID)
			_, _ = db.ExecContext(ctx, `DELETE FROM food_order_items WHERE id = $1`, orderItemID)
			_, _ = db.ExecContext(ctx, `DELETE FROM orders WHERE id = $1`, orderID)
		}
		_, _ = db.ExecContext(ctx, `DELETE FROM merchant_menu_items WHERE id = $1`, itemID)
		_, _ = db.ExecContext(ctx, `DELETE FROM merchant_catalog_events WHERE entity_id = $1`, itemID)
		_, _ = db.ExecContext(ctx, `DELETE FROM event_outbox WHERE aggregate_type = 'merchant_catalog' AND aggregate_id = $1 AND payload->>'entity_id' = $2`, merchantID, itemID)
		_ = db.Close()
	}
	t.Cleanup(cleanup)

	// Branch setup -> catalog: use the production repository. The database
	// trigger binds a new item to the merchant's MAIN branch.
	item := &domain.MenuItem{
		ID: itemID, MerchantID: merchantID, Nama: "Merchant Lifecycle Gate Menu",
		Harga: 27500, Kategori: "Gate", PrepTimeMinutes: 12,
		IsAvailable: true, Status: domain.MenuItemStatusActive,
		ModerationStatus: domain.MenuModerationApproved,
	}
	if err := menuRepo.Create(ctx, item); err != nil {
		t.Fatalf("create catalog item through repository: %v", err)
	}
	var itemBranchID string
	if err := db.QueryRowContext(ctx, `SELECT branch_id::text FROM merchant_menu_items WHERE id = $1`, itemID).Scan(&itemBranchID); err != nil {
		t.Fatalf("read catalog branch binding: %v", err)
	}
	if itemBranchID != mainBranch.ID {
		t.Fatalf("catalog item was not bound to MAIN branch: got=%s want=%s", itemBranchID, mainBranch.ID)
	}

	if _, err := db.ExecContext(ctx, `
		INSERT INTO orders (
			id, order_number, customer_id, merchant_id, model, status,
			pickup_location, pickup_address, dropoff_location, dropoff_address,
			base_price_idr, total_price_idr, ppn_idr, mdr_idr,
			service_category, service_sub_type, service_code, prep_time_minutes
		) VALUES ($1, $2, $3, $4, 'p2p', 'pending_merchant',
			ST_SetSRID(ST_MakePoint(106.797, -6.261), 4326), 'merchant gate pickup',
			ST_SetSRID(ST_MakePoint(106.798, -6.262), 4326), 'merchant gate dropoff',
			27500, 35000, 0, 0, 'food', 'food_delivery', 'food_delivery', 12)`,
		orderID, "mlg-"+orderID[:12], ownerID, merchantID); err != nil {
		t.Fatalf("insert pending food order: %v", err)
	}
	if _, err := db.ExecContext(ctx, `
		INSERT INTO food_order_items (id, order_id, menu_item_id, item_name, item_price, quantity, subtotal)
		VALUES ($1, $2, $3, 'Merchant Lifecycle Gate Menu', 27500, 1, 27500)`,
		orderItemID, orderID, itemID); err != nil {
		t.Fatalf("insert food order snapshot: %v", err)
	}

	orders, err := orderRepo.ListByMerchant(ctx, merchantID, "pending_merchant", 20, 0)
	if err != nil || len(orders) == 0 {
		t.Fatalf("merchant did not receive the pending food order: orders=%+v err=%v", orders, err)
	}
	if err := merchantSvc.AcceptOrder(ctx, ownerID, orderID); err != nil {
		t.Fatalf("accept food order through merchant service: %v", err)
	}
	if err := merchantSvc.MarkReady(ctx, ownerID, orderID); err != nil {
		t.Fatalf("mark food order ready through merchant service: %v", err)
	}
	var orderStatus string
	if err := db.QueryRowContext(ctx, `SELECT status FROM orders WHERE id = $1`, orderID).Scan(&orderStatus); err != nil {
		t.Fatalf("read food order state: %v", err)
	}
	if orderStatus != "searching" {
		t.Fatalf("merchant order lifecycle did not reach searching: %s", orderStatus)
	}
	var readyEvents int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM order_events WHERE order_id = $1 AND event_type = 'food_ready'`, orderID).Scan(&readyEvents); err != nil {
		t.Fatalf("read food-ready event: %v", err)
	}
	if readyEvents != 1 {
		t.Fatalf("expected one food-ready audit event, got %d", readyEvents)
	}

	statement, err := merchantSvc.GetFinanceStatement(ctx, ownerID, 100)
	if err != nil || statement == nil {
		t.Fatalf("merchant settlement/finance surface is not readable: statement=%+v err=%v", statement, err)
	}

	if err := db.QueryRowContext(ctx, `SELECT id::text FROM users WHERE id <> $1 AND role = 'customer' LIMIT 1`, ownerID).Scan(&staffUserID); err != nil {
		t.Fatalf("find staff test user: %v", err)
	}
	if _, err := db.ExecContext(ctx, `
		INSERT INTO merchant_staff (id, merchant_id, user_id, role, invite_token, invited_by, status, permissions)
		VALUES ($1, $2, $3, 'finance', $4, $5, 'active', $6)`,
		staffID, merchantID, staffUserID, "invite-"+staffID, ownerID, domain.DefaultPermissionsForRole(domain.StaffRoleFinance)); err != nil {
		t.Fatalf("insert finance staff fixture: %v", err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO merchant_staff_branch_access (staff_id, branch_id) VALUES ($1, $2)`, staffID, mainBranch.ID); err != nil {
		t.Fatalf("assign finance staff branch: %v", err)
	}
	session, err := accessRepo.CreateDeviceSession(ctx, domain.MerchantSessionAuthorization{
		MerchantID: merchantID, BranchID: mainBranch.ID, UserID: staffUserID,
		DeviceID: "merchant-lifecycle-finance-device", SessionToken: deviceToken,
	}, "Lifecycle finance gate", time.Hour)
	if err != nil {
		t.Fatalf("create finance staff device session: %v", err)
	}
	deviceSessionID = session.ID
	staffCtx := domain.WithMerchantAccess(ctx, domain.MerchantAccessContext{
		SessionToken: deviceToken, BranchID: mainBranch.ID,
		DeviceID: "merchant-lifecycle-finance-device", RequiredPermission: domain.PermViewReports,
	})
	if _, err := merchantSvc.GetFinanceStatement(staffCtx, staffUserID, 100); err != nil {
		t.Fatalf("finance staff should be able to read reports: %v", err)
	}
	if _, _, err := merchantSvc.RequestWithdrawal(staffCtx, staffUserID, domain.CreateMerchantWithdrawalInput{
		AmountIDR: 10000, BankName: "Gate Bank", BankAccountNumber: "123456789", BankAccountHolder: "Gate Staff",
		IdempotencyKey: "merchant-lifecycle-finance-withdrawal",
		ApprovalID:     uuid.NewString(),
	}); err == nil || !strings.Contains(err.Error(), "merchant tidak ditemukan") {
		t.Fatalf("finance staff withdrawal must be rejected as owner-only, got %v", err)
	}
}

func getenv(key string) string {
	return strings.TrimSpace(os.Getenv(key))
}
