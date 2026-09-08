package repository

import (
	"context"
	"database/sql"
	"os"
	"strings"
	"testing"

	"github.com/google/uuid"
	_ "github.com/lib/pq"
)

// TestMerchantDiscoveryCheckoutReleaseGateIntegration proves that the
// customer-facing discovery and checkout read paths share the merchant
// service's canonical state/catalog facts. The generated catalog item is
// cleaned up after the test; the append-only catalog version is intentionally
// retained as history.
func TestMerchantDiscoveryCheckoutReleaseGateIntegration(t *testing.T) {
	dsn := strings.TrimSpace(os.Getenv("TEMBUS_MERCHANT_LIFECYCLE_TEST_DATABASE_URL"))
	merchantID := strings.TrimSpace(os.Getenv("TEMBUS_MERCHANT_LIFECYCLE_TEST_MERCHANT_ID"))
	if dsn == "" || merchantID == "" {
		t.Skip("requires TEMBUS_MERCHANT_LIFECYCLE_TEST_DATABASE_URL and merchant fixture ID")
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
	repo := NewFoodRepository(db, db, nil)

	merchant, err := repo.GetFoodMerchant(ctx, merchantID)
	if err != nil {
		db.Close()
		t.Fatalf("read canonical merchant: %v", err)
	}
	if merchant == nil || merchant.VerificationStatus != "approved" || merchant.OperatingState != "open" && merchant.OperatingState != "busy" {
		db.Close()
		t.Fatalf("merchant is not discovery-eligible: %+v", merchant)
	}
	if merchant.Lat == 0 && merchant.Lng == 0 {
		db.Close()
		t.Fatal("merchant fixture must have a real pickup location")
	}

	discovered, err := repo.ListFoodMerchants(ctx, merchant.Lat, merchant.Lng, "", "all", 100)
	if err != nil {
		db.Close()
		t.Fatalf("list canonical discovery: %v", err)
	}
	var discoveredMerchant *struct {
		id    string
		state string
	}
	for _, candidate := range discovered {
		if candidate.ID == merchantID {
			discoveredMerchant = &struct {
				id    string
				state string
			}{candidate.ID, candidate.OperatingState}
			break
		}
	}
	if discoveredMerchant == nil || discoveredMerchant.state != merchant.OperatingState {
		db.Close()
		t.Fatalf("discovery state diverges from detail state: detail=%s discovered=%+v", merchant.OperatingState, discoveredMerchant)
	}

	var branchID string
	if err := db.QueryRowContext(ctx, `
		SELECT id::text FROM merchant_branches
		WHERE merchant_id = $1 AND is_active
		ORDER BY CASE WHEN code = 'MAIN' THEN 0 ELSE 1 END, created_at
		LIMIT 1`, merchantID).Scan(&branchID); err != nil {
		db.Close()
		t.Fatalf("find active catalog branch: %v", err)
	}
	itemID := uuid.NewString()
	t.Cleanup(func() {
		_, _ = db.ExecContext(ctx, `DELETE FROM merchant_menu_items WHERE id = $1`, itemID)
		_, _ = db.ExecContext(ctx, `DELETE FROM merchant_catalog_events WHERE entity_id = $1`, itemID)
		_, _ = db.ExecContext(ctx, `DELETE FROM event_outbox WHERE aggregate_type = 'merchant_catalog' AND aggregate_id = $1 AND payload->>'entity_id' = $2`, merchantID, itemID)
		_ = db.Close()
	})

	if _, err := db.ExecContext(ctx, `
		INSERT INTO merchant_menu_items (
			id, merchant_id, branch_id, nama, harga, kategori, is_available,
			status, moderation_status, prep_time_minutes
		) VALUES ($1, $2, $3, 'Discovery Checkout Gate Menu', 27500, 'Gate', TRUE,
			'active', 'approved', 12)`, itemID, merchantID, branchID); err != nil {
		t.Fatalf("insert canonical catalog item: %v", err)
	}
	items, err := repo.GetFoodMenuItems(ctx, []string{itemID})
	if err != nil || len(items) != 1 {
		t.Fatalf("active catalog item not readable by checkout: items=%+v err=%v", items, err)
	}
	if items[0].Price != 27500 || items[0].BranchID != branchID || items[0].EnforcementActive {
		t.Fatalf("unexpected checkout catalog projection: %+v", items[0])
	}

	// Change the canonical menu price, then prove checkout reads the new server
	// value. A client-supplied stale price is never part of this read path.
	if _, err := db.ExecContext(ctx, `UPDATE merchant_menu_items SET harga = 41000 WHERE id = $1`, itemID); err != nil {
		t.Fatalf("update canonical menu price: %v", err)
	}
	items, err = repo.GetFoodMenuItems(ctx, []string{itemID})
	if err != nil || len(items) != 1 || items[0].Price != 41000 {
		t.Fatalf("checkout did not read updated server price: items=%+v err=%v", items, err)
	}

	var catalogEventType, outboxConsumer, outboxSource string
	if err := db.QueryRowContext(ctx, `
		SELECT event_type, headers->>'consumer', headers->>'source_of_truth'
		FROM event_outbox
		WHERE aggregate_type = 'merchant_catalog'
		  AND aggregate_id = $1
		  AND payload->>'entity_id' = $2
		ORDER BY created_at DESC
		LIMIT 1`, merchantID, itemID).Scan(&catalogEventType, &outboxConsumer, &outboxSource); err != nil {
		t.Fatalf("read Search catalog outbox: %v", err)
	}
	if catalogEventType != "merchant.catalog.changed" || outboxConsumer != "search-index" || outboxSource != "merchant-service" {
		t.Fatalf("catalog event did not preserve Search ownership: event=%q consumer=%q source=%q", catalogEventType, outboxConsumer, outboxSource)
	}
	var eventAction string
	var eventPrice int64
	if err := db.QueryRowContext(ctx, `
		SELECT action, (payload->'record'->>'harga')::bigint
		FROM merchant_catalog_events
		WHERE merchant_id = $1 AND entity_id = $2
		ORDER BY version DESC LIMIT 1`, merchantID, itemID).Scan(&eventAction, &eventPrice); err != nil {
		t.Fatalf("read canonical catalog event: %v", err)
	}
	if eventAction != "updated" || eventPrice != 41000 {
		t.Fatalf("catalog event does not describe the canonical update: action=%q price=%d", eventAction, eventPrice)
	}
}
