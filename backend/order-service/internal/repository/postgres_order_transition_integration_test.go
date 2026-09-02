package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"sync"
	"tembus/order-service/internal/domain"
	"testing"

	"github.com/google/uuid"
	_ "github.com/lib/pq"
)

// Run this test with TEMBUS_ORDER_SERVICE_TEST_DATABASE_URL pointing at an
// isolated PostgreSQL database. It is skipped by default so unit-only CI does
// not silently claim database coverage.
func TestPostgresTransitionCommitsEffectsAndReplays(t *testing.T) {
	dsn := os.Getenv("TEMBUS_ORDER_SERVICE_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEMBUS_ORDER_SERVICE_TEST_DATABASE_URL is not configured")
	}
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatalf("open postgres: %v", err)
	}
	defer db.Close()
	if err := db.PingContext(context.Background()); err != nil {
		t.Fatalf("ping postgres: %v", err)
	}

	ctx := context.Background()
	var customerID string
	if err := db.QueryRowContext(ctx, `SELECT id::text FROM users LIMIT 1`).Scan(&customerID); err != nil {
		t.Fatalf("find fixture customer: %v", err)
	}
	orderID := uuid.NewString()
	if _, err := db.ExecContext(ctx, `
		INSERT INTO orders
			(id, order_number, customer_id, model, status, pickup_location, pickup_address,
			 dropoff_location, dropoff_address, base_price_idr, total_price_idr, ppn_idr, mdr_idr,
			 service_category)
		VALUES ($1, $2, $3, 'p2p', 'delivering',
			ST_SetSRID(ST_MakePoint(106.8, -6.2), 4326), 'pickup test',
			ST_SetSRID(ST_MakePoint(106.81, -6.21), 4326), 'dropoff test',
			100000, 100000, 0, 0, 'package_on_demand')`,
		orderID, "transition-test-"+orderID[:12], customerID); err != nil {
		t.Fatalf("insert fixture order: %v", err)
	}
	defer func() {
		_, _ = db.ExecContext(ctx, `DELETE FROM order_events WHERE order_id = $1`, orderID)
		_, _ = db.ExecContext(ctx, `DELETE FROM package_scans WHERE order_id = $1`, orderID)
		_, _ = db.ExecContext(ctx, `DELETE FROM orders WHERE id = $1`, orderID)
	}()

	photoURL := "https://cdn.example.test/transition-proof.jpg"
	proof := &domain.PackageScan{OrderID: orderID, ScanType: "delivered", ScannedBy: customerID, PhotoURL: &photoURL}
	repo := NewPostgresRepository(db, db, nil)
	request := domain.OrderTransitionRequest{
		OrderID:        orderID,
		ActorID:        customerID,
		Actor:          domain.OrderActorCourier,
		TargetStatus:   domain.StatusDelivered,
		IdempotencyKey: "transition-integration-" + orderID,
		Proof:          proof,
	}
	results := make(chan struct {
		result domain.OrderTransitionResult
		err    error
	}, 2)
	var wg sync.WaitGroup
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			result, transitionErr := repo.TransitionOrder(ctx, request)
			results <- struct {
				result domain.OrderTransitionResult
				err    error
			}{result: result, err: transitionErr}
		}()
	}
	wg.Wait()
	close(results)
	var first domain.OrderTransitionResult
	replayCount := 0
	for attempt := range results {
		if attempt.err != nil {
			t.Fatalf("concurrent transition: %v", attempt.err)
		}
		if attempt.result.Replayed {
			replayCount++
		} else if attempt.result.Applied {
			first = attempt.result
		}
	}
	if !first.Applied || first.LedgerJournalID == nil || first.ProofID == "" || replayCount != 1 {
		t.Fatalf("expected one commit and one replay, result=%#v replay_count=%d", first, replayCount)
	}

	second, err := repo.TransitionOrder(ctx, request)
	if err != nil {
		t.Fatalf("replayed transition: %v", err)
	}
	if !second.Replayed || second.AuditEventID != first.AuditEventID {
		t.Fatalf("expected replay of same audit event, first=%#v second=%#v", first, second)
	}

	var status string
	var eventCount, proofCount, journalCount int
	if err := db.QueryRowContext(ctx, `SELECT status FROM orders WHERE id = $1`, orderID).Scan(&status); err != nil {
		t.Fatalf("read committed order: %v", err)
	}
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM order_events WHERE idempotency_key = $1`, request.IdempotencyKey).Scan(&eventCount); err != nil {
		t.Fatalf("count audit event: %v", err)
	}
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM package_scans WHERE idempotency_key = $1`, request.IdempotencyKey).Scan(&proofCount); err != nil {
		t.Fatalf("count proof: %v", err)
	}
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM ledger_journals WHERE idempotency_key = $1`, "LEDGER-DELIVERED-"+orderID).Scan(&journalCount); err != nil {
		t.Fatalf("count ledger: %v", err)
	}
	if status != string(domain.StatusDelivered) || eventCount != 1 || proofCount != 1 || journalCount != 1 {
		t.Fatalf("transactional effects mismatch: status=%s events=%d proofs=%d journals=%d", status, eventCount, proofCount, journalCount)
	}
	scans, err := repo.GetScansForOrder(ctx, orderID)
	if err != nil || len(scans) != 1 || scans[0].PhotoURL == nil {
		t.Fatalf("expected persisted delivery proof to be readable, scans=%#v err=%v", scans, err)
	}
}

func TestPostgresTransitionRejectsMissingDeliveryProof(t *testing.T) {
	dsn := os.Getenv("TEMBUS_ORDER_SERVICE_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEMBUS_ORDER_SERVICE_TEST_DATABASE_URL is not configured")
	}
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatalf("open postgres: %v", err)
	}
	defer db.Close()
	ctx := context.Background()
	var customerID string
	if err := db.QueryRowContext(ctx, `SELECT id::text FROM users LIMIT 1`).Scan(&customerID); err != nil {
		t.Fatalf("find fixture customer: %v", err)
	}
	orderID := uuid.NewString()
	if _, err := db.ExecContext(ctx, `
		INSERT INTO orders
			(id, order_number, customer_id, model, status, pickup_location, pickup_address,
			 dropoff_location, dropoff_address, base_price_idr, total_price_idr, ppn_idr, mdr_idr,
			 service_category)
		VALUES ($1, $2, $3, 'p2p', 'delivering',
			ST_SetSRID(ST_MakePoint(106.8, -6.2), 4326), 'pickup test',
			ST_SetSRID(ST_MakePoint(106.81, -6.21), 4326), 'dropoff test',
			100000, 100000, 0, 0, 'package_on_demand')`,
		orderID, "transition-proof-"+orderID[:12], customerID); err != nil {
		t.Fatalf("insert fixture order: %v", err)
	}
	defer func() {
		_, _ = db.ExecContext(ctx, `DELETE FROM order_events WHERE order_id = $1`, orderID)
		_, _ = db.ExecContext(ctx, `DELETE FROM orders WHERE id = $1`, orderID)
	}()

	_, err = NewPostgresRepository(db, db, nil).TransitionOrder(ctx, domain.OrderTransitionRequest{
		OrderID:        orderID,
		ActorID:        customerID,
		Actor:          domain.OrderActorCourier,
		TargetStatus:   domain.StatusDelivered,
		IdempotencyKey: "transition-proof-missing-" + orderID,
	})
	if !errors.Is(err, domain.ErrTransitionProofRequired) {
		t.Fatalf("expected proof-required error, got %v", err)
	}
	var status string
	if err := db.QueryRowContext(ctx, `SELECT status FROM orders WHERE id = $1`, orderID).Scan(&status); err != nil {
		t.Fatalf("read order after rejected transition: %v", err)
	}
	if status != string(domain.StatusDelivering) {
		t.Fatalf("rejected transition changed order status to %s", status)
	}
	var count int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM order_events WHERE idempotency_key = $1`, "transition-proof-missing-"+orderID).Scan(&count); err != nil {
		t.Fatalf("count rejected audit event: %v", err)
	}
	if count != 0 {
		t.Fatalf("rejected transition wrote %d audit events", count)
	}
}

func TestPostgresTransitionRequiresAdminReason(t *testing.T) {
	dsn := os.Getenv("TEMBUS_ORDER_SERVICE_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEMBUS_ORDER_SERVICE_TEST_DATABASE_URL is not configured")
	}
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatalf("open postgres: %v", err)
	}
	defer db.Close()
	ctx := context.Background()
	var customerID string
	if err := db.QueryRowContext(ctx, `SELECT id::text FROM users LIMIT 1`).Scan(&customerID); err != nil {
		t.Fatalf("find fixture customer: %v", err)
	}
	orderID := uuid.NewString()
	if _, err := db.ExecContext(ctx, `
		INSERT INTO orders
			(id, order_number, customer_id, model, status, pickup_location, pickup_address,
			 dropoff_location, dropoff_address, base_price_idr, total_price_idr, ppn_idr, mdr_idr,
			 service_category)
		VALUES ($1, $2, $3, 'p2p', 'delivering',
			ST_SetSRID(ST_MakePoint(106.8, -6.2), 4326), 'pickup test',
			ST_SetSRID(ST_MakePoint(106.81, -6.21), 4326), 'dropoff test',
			100000, 100000, 0, 0, 'package_on_demand')`,
		orderID, "transition-admin-"+orderID[:12], customerID); err != nil {
		t.Fatalf("insert fixture order: %v", err)
	}
	defer func() { _, _ = db.ExecContext(ctx, `DELETE FROM orders WHERE id = $1`, orderID) }()

	_, err = NewPostgresRepository(db, db, nil).TransitionOrder(ctx, domain.OrderTransitionRequest{
		OrderID:      orderID,
		ActorID:      customerID,
		Actor:        domain.OrderActorAdmin,
		TargetStatus: domain.StatusFailedDelivery,
	})
	if !errors.Is(err, domain.ErrAdminOverrideReasonRequired) {
		t.Fatalf("expected admin reason error, got %v", err)
	}
	if err == nil || fmt.Sprint(err) == "" {
		t.Fatal("expected a typed admin override error")
	}

	const reason = "Customer reported verified delivery exception"
	result, err := NewPostgresRepository(db, db, nil).TransitionOrder(ctx, domain.OrderTransitionRequest{
		OrderID:        orderID,
		ActorID:        customerID,
		Actor:          domain.OrderActorAdmin,
		TargetStatus:   domain.StatusFailedDelivery,
		Reason:         reason,
		IdempotencyKey: "transition-admin-reason-" + orderID,
	})
	if err != nil || !result.Applied {
		t.Fatalf("reasoned admin override failed: result=%#v err=%v", result, err)
	}
	var eventType, storedReason string
	if err := db.QueryRowContext(ctx, `
		SELECT event_type, reason FROM order_events WHERE idempotency_key = $1`, "transition-admin-reason-"+orderID).Scan(&eventType, &storedReason); err != nil {
		t.Fatalf("read admin audit event: %v", err)
	}
	if eventType != "order.admin_override" || storedReason != reason {
		t.Fatalf("admin audit reason mismatch: type=%s reason=%s", eventType, storedReason)
	}
}

func TestPostgresAssignCourierAuditsCanonicalTransition(t *testing.T) {
	dsn := os.Getenv("TEMBUS_ORDER_SERVICE_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEMBUS_ORDER_SERVICE_TEST_DATABASE_URL is not configured")
	}
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatalf("open postgres: %v", err)
	}
	defer db.Close()
	ctx := context.Background()
	var courierID string
	if err := db.QueryRowContext(ctx, `SELECT id::text FROM users LIMIT 1`).Scan(&courierID); err != nil {
		t.Fatalf("find fixture courier: %v", err)
	}
	orderID := uuid.NewString()
	if _, err := db.ExecContext(ctx, `
		INSERT INTO orders
			(id, order_number, customer_id, model, status, pickup_location, pickup_address,
			 dropoff_location, dropoff_address, base_price_idr, total_price_idr, ppn_idr, mdr_idr,
			 service_category)
		VALUES ($1, $2, $3, 'p2p', 'searching',
			ST_SetSRID(ST_MakePoint(106.8, -6.2), 4326), 'pickup assignment test',
			ST_SetSRID(ST_MakePoint(106.81, -6.21), 4326), 'dropoff assignment test',
			100000, 100000, 0, 0, 'package_on_demand')`,
		orderID, "transition-assign-"+orderID[:12], courierID); err != nil {
		t.Fatalf("insert fixture order: %v", err)
	}
	if _, err := db.ExecContext(ctx, `
		INSERT INTO order_legs (order_id, leg_number, status, assigned_fee_idr)
		VALUES ($1, 1, 'searching', 10000)`, orderID); err != nil {
		t.Fatalf("insert assignment leg: %v", err)
	}
	defer func() {
		_, _ = db.ExecContext(ctx, `DELETE FROM order_events WHERE order_id = $1`, orderID)
		_, _ = db.ExecContext(ctx, `DELETE FROM order_legs WHERE order_id = $1`, orderID)
		_, _ = db.ExecContext(ctx, `DELETE FROM orders WHERE id = $1`, orderID)
	}()

	repo := NewPostgresRepository(db, db, nil)
	if err := repo.AssignCourier(ctx, orderID, courierID); err != nil {
		t.Fatalf("assign courier: %v", err)
	}
	if err := repo.AssignCourier(ctx, orderID, courierID); err != nil {
		t.Fatalf("idempotent assign courier: %v", err)
	}
	var status string
	if err := db.QueryRowContext(ctx, `SELECT status FROM orders WHERE id = $1`, orderID).Scan(&status); err != nil {
		t.Fatalf("read assigned order: %v", err)
	}
	if status != string(domain.StatusAssigned) {
		t.Fatalf("assignment mismatch: status=%s", status)
	}
	var legStatus, legCourier string
	if err := db.QueryRowContext(ctx, `SELECT status, courier_id::text FROM order_legs WHERE order_id = $1`, orderID).Scan(&legStatus, &legCourier); err != nil {
		t.Fatalf("read assigned leg: %v", err)
	}
	if legStatus != string(domain.StatusAssigned) || legCourier != courierID {
		t.Fatalf("assignment leg mismatch: status=%s courier=%s", legStatus, legCourier)
	}
	var eventCount int
	if err := db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM order_events
		WHERE order_id = $1 AND idempotency_key = $2`, orderID, "courier-assign:"+orderID+":"+courierID).Scan(&eventCount); err != nil {
		t.Fatalf("count assignment audit: %v", err)
	}
	if eventCount != 1 {
		t.Fatalf("expected one assignment audit event, got %d", eventCount)
	}
}
