package repository

import (
	"context"
	"database/sql"
	"os"
	"strings"
	"testing"

	"github.com/google/uuid"
	_ "github.com/lib/pq"
	"tembus/integration-gateway/internal/domain"
)

func TestPOSRepositoryDeliveryLifecycleIntegration(t *testing.T) {
	dsn := os.Getenv("TEMBUS_POS_INTEGRATION_DATABASE_URL")
	if dsn == "" {
		t.Skip("requires TEMBUS_POS_INTEGRATION_DATABASE_URL")
	}
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	ctx := context.Background()
	if err := db.PingContext(ctx); err != nil {
		t.Fatal(err)
	}

	var merchantID, orderID, branchID string
	err = db.QueryRowContext(ctx, `
		SELECT m.id, o.id, b.id
		FROM merchants m
		JOIN orders o ON o.merchant_id = m.id
		JOIN merchant_branches b ON b.merchant_id = m.id
		LIMIT 1`).Scan(&merchantID, &orderID, &branchID)
	if err == sql.ErrNoRows {
		t.Skip("requires a merchant, order and branch fixture")
	}
	if err != nil {
		t.Fatal(err)
	}

	providerCode := "test-pos-" + uuid.NewString()
	key := "pos-repository-" + uuid.NewString()
	repo := NewPostgresPOSRepository(db)
	request := domain.POSOrderRequest{
		MerchantID: merchantID, BranchID: branchID, OrderID: orderID,
		IdempotencyKey: key, Payload: []byte(`{"order_number":"integration-test"}`),
	}
	requestHash := strings.Repeat("a", 64)
	cleanup := func() {
		for _, statement := range []string{
			"DELETE FROM pos_reconciliation_items WHERE provider_code = $1",
			"DELETE FROM pos_integration_events WHERE provider_code = $1",
			"DELETE FROM pos_order_deliveries WHERE provider_code = $1",
			"DELETE FROM pos_connector_bindings WHERE provider_code = $1",
			"DELETE FROM pos_connector_health WHERE provider_code = $1",
		} {
			_, _ = db.ExecContext(ctx, statement, providerCode)
		}
	}
	defer cleanup()

	delivery, duplicate, inProgress, err := repo.BeginOrderDelivery(ctx, request, providerCode, requestHash)
	if err != nil {
		t.Fatal(err)
	}
	if delivery.Status != "pending" || duplicate || inProgress || delivery.MerchantReceived || delivery.CustomerOrderStatus != "pending_merchant" {
		t.Fatalf("unexpected initial delivery state: %#v duplicate=%v in_progress=%v", delivery, duplicate, inProgress)
	}

	replay, duplicate, inProgress, err := repo.BeginOrderDelivery(ctx, request, providerCode, requestHash)
	if err != nil {
		t.Fatal(err)
	}
	if !duplicate || !inProgress || replay.ID != delivery.ID {
		t.Fatalf("expected in-progress idempotent replay: %#v duplicate=%v in_progress=%v", replay, duplicate, inProgress)
	}
	if err := repo.FinishOrderDelivery(ctx, delivery.ID, "failed", "", "provider timeout"); err != nil {
		t.Fatal(err)
	}

	retry, duplicate, inProgress, err := repo.BeginOrderDelivery(ctx, request, providerCode, requestHash)
	if err != nil {
		t.Fatal(err)
	}
	if !duplicate || inProgress || retry.Status != "pending" || retry.Attempts != 2 {
		t.Fatalf("expected claimed retry: %#v duplicate=%v in_progress=%v", retry, duplicate, inProgress)
	}
	if err := repo.FinishOrderDelivery(ctx, retry.ID, "acknowledged", "provider-receipt-1", ""); err != nil {
		t.Fatal(err)
	}

	ack, duplicate, inProgress, err := repo.BeginOrderDelivery(ctx, request, providerCode, requestHash)
	if err != nil {
		t.Fatal(err)
	}
	if !duplicate || inProgress || ack.Status != "acknowledged" || !ack.MerchantReceived || ack.CustomerOrderStatus != "pending_merchant" {
		t.Fatalf("expected acknowledged replay without customer acceptance: %#v duplicate=%v in_progress=%v", ack, duplicate, inProgress)
	}

	syncRequest := domain.POSCatalogSyncRequest{
		MerchantID: merchantID, BranchID: branchID, ResourceID: "catalog-" + uuid.NewString(),
		CanonicalVersion: 1, IdempotencyKey: "pos-sync-" + uuid.NewString(),
		Payload: []byte(`{"resource":"catalog","version":1}`),
	}
	operation, duplicate, inProgress, err := repo.BeginSyncOperation(ctx, "catalog", syncRequest, providerCode, strings.Repeat("b", 64))
	if err != nil {
		t.Fatal(err)
	}
	if operation.Status != "pending" || duplicate || inProgress {
		t.Fatalf("unexpected initial sync state: %#v duplicate=%v in_progress=%v", operation, duplicate, inProgress)
	}
	if err := repo.FinishSyncOperation(ctx, operation.ID, "acknowledged", "provider-sync-receipt-1", ""); err != nil {
		t.Fatal(err)
	}

	if err := repo.RecordHealth(ctx, domain.POSHealth{
		ProviderCode: providerCode, ProviderName: "Integration Test POS", State: "healthy",
		Capabilities: []domain.POSCapability{domain.POSCapabilityOrderReceipt},
	}); err != nil {
		t.Fatal(err)
	}
	health, err := repo.ListHealth(ctx, merchantID)
	if err != nil || len(health) != 1 || health[0].State != "healthy" {
		t.Fatalf("unexpected health projection: %#v err=%v", health, err)
	}
	reconciliation, err := repo.ListReconciliation(ctx, merchantID, 100)
	if err != nil || len(reconciliation) != 2 {
		t.Fatalf("unexpected reconciliation projection: %#v err=%v", reconciliation, err)
	}
	for _, item := range reconciliation {
		if item.Status != "resolved" || item.LocalStatus != "acknowledged" {
			t.Fatalf("unresolved reconciliation projection: %#v", item)
		}
	}
}
