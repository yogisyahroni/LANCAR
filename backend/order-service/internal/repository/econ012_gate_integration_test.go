package repository

import (
	"context"
	"database/sql"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/lib/pq"
)

// ECON-2026-012 uses real PostgreSQL for the race-sensitive scenarios. The
// test is skipped when an isolated integration DSN is not supplied; a unit
// test skip is not represented as integration PASS in task evidence.
func econ012TestDB(t *testing.T) *sql.DB {
	t.Helper()
	dsn := os.Getenv("TEMBUS_ORDER_SERVICE_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEMBUS_ORDER_SERVICE_TEST_DATABASE_URL is not configured")
	}
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatalf("open postgres: %v", err)
	}
	db.SetMaxOpenConns(12)
	if err := db.PingContext(context.Background()); err != nil {
		db.Close()
		t.Fatalf("ping postgres: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db
}

func econ012Exec(t *testing.T, db *sql.DB, query string, args ...any) {
	t.Helper()
	if _, err := db.ExecContext(context.Background(), query, args...); err != nil {
		t.Fatalf("fixture SQL failed: %v", err)
	}
}

func TestECON012ConcurrentIncentiveCompletionHasOneLiability(t *testing.T) {
	db := econ012TestDB(t)
	ctx := context.Background()
	customerID, courierID, merchantUserID := uuid.New(), uuid.New(), uuid.New()
	profileID, merchantID, campaignID := uuid.New(), uuid.New(), uuid.New()
	orderIDs := []uuid.UUID{uuid.New(), uuid.New()}
	legIDs := []uuid.UUID{uuid.New(), uuid.New()}
	defer func() {
		_, _ = db.ExecContext(ctx, `DELETE FROM courier_incentive_campaigns WHERE id = $1`, campaignID)
		_, _ = db.ExecContext(ctx, `DELETE FROM order_legs WHERE id = ANY($1::uuid[])`, pqUUIDArray(legIDs))
		_, _ = db.ExecContext(ctx, `DELETE FROM orders WHERE id = ANY($1::uuid[])`, pqUUIDArray(orderIDs))
		_, _ = db.ExecContext(ctx, `DELETE FROM merchants WHERE id = $1`, merchantID)
		_, _ = db.ExecContext(ctx, `DELETE FROM courier_profiles WHERE id = $1`, profileID)
		_, _ = db.ExecContext(ctx, `DELETE FROM users WHERE id IN ($1, $2, $3)`, customerID, courierID, merchantUserID)
	}()

	econ012Exec(t, db, `
		INSERT INTO users (id, phone_number, full_name, role)
		VALUES ($1, $2, 'ECON012 customer', 'customer'),
		       ($3, $4, 'ECON012 courier', 'courier'),
		       ($5, $6, 'ECON012 merchant owner', 'customer')`,
		customerID, "+628"+customerID.String()[:12], courierID, "+628"+courierID.String()[:12], merchantUserID, "+628"+merchantUserID.String()[:12])
	econ012Exec(t, db, `
		INSERT INTO courier_profiles (id, user_id, vehicle_type, vehicle_plate, is_verified, tier)
		VALUES ($1, $2, 'matic', $3, TRUE, 'gold')`,
		profileID, courierID, "E12"+profileID.String()[:7])
	econ012Exec(t, db, `
		INSERT INTO merchants (id, user_id, nama_toko, alamat, is_open, verification_status)
		VALUES ($1, $2, 'ECON012 Store', 'Jakarta', TRUE, 'approved')`, merchantID, merchantUserID)
	now := time.Now().UTC()
	econ012Exec(t, db, `
		INSERT INTO courier_incentive_campaigns
			(id, code, title, target_deliveries, reward_idr, starts_at, ends_at,
			 is_active, budget_idr, policy_version)
		VALUES ($1, $2, 'ECON012 race campaign', 1, 50000, $3, $4, TRUE, 50000, 'econ012-v1')`,
		campaignID, "econ012-"+campaignID.String()[:12], now.Add(-time.Minute), now.Add(time.Hour))
	for i := range orderIDs {
		econ012Exec(t, db, `
			INSERT INTO orders
				(id, order_number, customer_id, merchant_id, model, status,
				 pickup_location, pickup_address, dropoff_location, dropoff_address,
				 base_price_idr, total_price_idr, ppn_idr, mdr_idr,
				 service_category, service_code)
			VALUES ($1, $2, $3, $4, 'p2p', 'assigned',
				 ST_SetSRID(ST_MakePoint(106.8, -6.2), 4326), 'pickup',
				 ST_SetSRID(ST_MakePoint(106.81, -6.21), 4326), 'dropoff',
				 100000, 100000, 0, 0, 'food', 'food_delivery')`,
			orderIDs[i], "ECON012-"+orderIDs[i].String()[:12], customerID, merchantID)
		econ012Exec(t, db, `
			INSERT INTO order_legs (id, order_id, leg_number, courier_id, status, assigned_fee_idr)
			VALUES ($1, $2, 1, $3, 'assigned', 24000)`, legIDs[i], orderIDs[i], courierID)
	}

	// Two independent transactions finish separate orders for the same courier
	// at the same time. The progress row, budget reservation and unique
	// liability must serialize without paying the reward twice.
	errs := make(chan error, len(legIDs))
	var wg sync.WaitGroup
	for _, legID := range legIDs {
		legID := legID
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := db.ExecContext(ctx, `UPDATE order_legs SET status = 'delivered', completed_at = NOW() WHERE id = $1`, legID)
			errs <- err
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatalf("concurrent delivery update: %v", err)
		}
	}

	var completed int
	var progressStatus string
	if err := db.QueryRowContext(ctx, `
		SELECT completed_deliveries, status
		FROM courier_incentive_progress WHERE campaign_id = $1 AND courier_id = $2`, campaignID, courierID).
		Scan(&completed, &progressStatus); err != nil {
		t.Fatalf("read incentive progress: %v", err)
	}
	var liabilities int
	var liabilityAmount int
	if err := db.QueryRowContext(ctx, `
		SELECT COUNT(*)::int, COALESCE(SUM(amount_idr), 0)::int
		FROM courier_incentive_liabilities WHERE campaign_id = $1 AND courier_id = $2`, campaignID, courierID).
		Scan(&liabilities, &liabilityAmount); err != nil {
		t.Fatalf("read incentive liability: %v", err)
	}
	var reserved int
	if err := db.QueryRowContext(ctx, `SELECT budget_reserved_idr FROM courier_incentive_campaigns WHERE id = $1`, campaignID).Scan(&reserved); err != nil {
		t.Fatalf("read incentive budget: %v", err)
	}
	if completed != 1 || progressStatus != "earned" || liabilities != 1 || liabilityAmount != 50000 || reserved != 50000 {
		t.Fatalf("incentive race paid incorrectly: progress=%d/%s liabilities=%d amount=%d reserved=%d", completed, progressStatus, liabilities, liabilityAmount, reserved)
	}
}

func TestECON012CancellationCompensationCreditIsReplaySafe(t *testing.T) {
	db := econ012TestDB(t)
	ctx := context.Background()
	customerID, courierID := uuid.New(), uuid.New()
	profileID, orderID, legID := uuid.New(), uuid.New(), uuid.New()
	defer func() {
		_, _ = db.ExecContext(ctx, `DELETE FROM order_legs WHERE id = $1`, legID)
		_, _ = db.ExecContext(ctx, `DELETE FROM orders WHERE id = $1`, orderID)
		_, _ = db.ExecContext(ctx, `DELETE FROM courier_profiles WHERE id = $1`, profileID)
		_, _ = db.ExecContext(ctx, `DELETE FROM users WHERE id IN ($1, $2)`, customerID, courierID)
	}()

	econ012Exec(t, db, `
		INSERT INTO users (id, phone_number, full_name, role)
		VALUES ($1, $2, 'ECON012 cancellation customer', 'customer'),
		       ($3, $4, 'ECON012 cancellation courier', 'courier')`,
		customerID, "+628"+customerID.String()[:12], courierID, "+628"+courierID.String()[:12])
	econ012Exec(t, db, `
		INSERT INTO courier_profiles (id, user_id, vehicle_type, vehicle_plate, is_verified, tier)
		VALUES ($1, $2, 'matic', $3, TRUE, 'gold')`, profileID, courierID, "E12"+profileID.String()[:7])
	econ012Exec(t, db, `
		INSERT INTO orders
			(id, order_number, customer_id, model, status, pickup_location, pickup_address,
			 dropoff_location, dropoff_address, base_price_idr, total_price_idr, ppn_idr, mdr_idr,
			 service_category, service_code)
		VALUES ($1, $2, $3, 'p2p', 'assigned',
			 ST_SetSRID(ST_MakePoint(106.8, -6.2), 4326), 'pickup',
			 ST_SetSRID(ST_MakePoint(106.81, -6.21), 4326), 'dropoff',
			 100000, 100000, 0, 0, 'food', 'food_delivery')`,
		orderID, "ECON012-CANCEL-"+orderID.String()[:8], customerID)
	econ012Exec(t, db, `
		INSERT INTO order_legs (id, order_id, leg_number, courier_id, status, assigned_fee_idr)
		VALUES ($1, $2, 1, $3, 'assigned', 24000)`, legID, orderID, courierID)

	econ012Exec(t, db, `
		UPDATE order_legs
		SET status = 'cancelled', cancellation_compensation_idr = 7000
		WHERE id = $1`, legID)
	// Replaying the same terminal update must not create a second credit.
	econ012Exec(t, db, `
		UPDATE order_legs
		SET status = 'cancelled', cancellation_compensation_idr = 7000
		WHERE id = $1`, legID)

	var credits int
	var amount int
	var terminalEvent string
	if err := db.QueryRowContext(ctx, `
		SELECT COUNT(*)::int, COALESCE(SUM(amount_idr), 0)::int,
		       COALESCE(MAX(metadata->>'terminal_event'), '')
		FROM courier_earnings_ledger
		WHERE courier_id = $1 AND order_id = $2 AND source = 'delivery'`, courierID, orderID).
		Scan(&credits, &amount, &terminalEvent); err != nil {
		t.Fatalf("read cancellation earning: %v", err)
	}
	if credits != 1 || amount != 7000 || terminalEvent != "cancellation" {
		t.Fatalf("cancellation compensation is not replay-safe/auditable: credits=%d amount=%d event=%s", credits, amount, terminalEvent)
	}
}

func TestECON012CancellationFeeClaimSerializesConcurrentSettlements(t *testing.T) {
	db := econ012TestDB(t)
	ctx := context.Background()
	merchantUserID, customerID := uuid.New(), uuid.New()
	merchantID, orderID, feeID := uuid.New(), uuid.New(), uuid.New()
	settlementIDs := []uuid.UUID{uuid.New(), uuid.New()}
	defer func() {
		_, _ = db.ExecContext(ctx, `DELETE FROM merchant_cancellation_fees WHERE id = $1`, feeID)
		_, _ = db.ExecContext(ctx, `DELETE FROM merchant_settlements WHERE id = ANY($1::uuid[])`, pqUUIDArray(settlementIDs))
		_, _ = db.ExecContext(ctx, `DELETE FROM orders WHERE id = $1`, orderID)
		_, _ = db.ExecContext(ctx, `DELETE FROM merchants WHERE id = $1`, merchantID)
		_, _ = db.ExecContext(ctx, `DELETE FROM users WHERE id IN ($1, $2)`, merchantUserID, customerID)
	}()

	econ012Exec(t, db, `
		INSERT INTO users (id, phone_number, full_name, role)
		VALUES ($1, $2, 'ECON012 fee merchant', 'customer'),
		       ($3, $4, 'ECON012 fee customer', 'customer')`,
		merchantUserID, "+628"+merchantUserID.String()[:12], customerID, "+628"+customerID.String()[:12])
	econ012Exec(t, db, `
		INSERT INTO merchants (id, user_id, nama_toko, alamat, is_open, verification_status)
		VALUES ($1, $2, 'ECON012 Fee Store', 'Jakarta', TRUE, 'approved')`, merchantID, merchantUserID)
	econ012Exec(t, db, `
		INSERT INTO orders
			(id, order_number, customer_id, model, status, pickup_location, pickup_address,
			 dropoff_location, dropoff_address, base_price_idr, total_price_idr, ppn_idr, mdr_idr)
		VALUES ($1, $2, $3, 'p2p', 'cancelled',
			 ST_SetSRID(ST_MakePoint(106.8, -6.2), 4326), 'pickup',
			 ST_SetSRID(ST_MakePoint(106.81, -6.21), 4326), 'dropoff',
			 100000, 100000, 0, 0)`, orderID, "ECON012-FEE-"+orderID.String()[:10], customerID)
	for _, settlementID := range settlementIDs {
		econ012Exec(t, db, `
			INSERT INTO merchant_settlements
				(id, payment_link_id, merchant_id, order_id, gross_item_price_idr,
				 merchant_fee_idr, disbursement_fee_idr, net_payout_idr, status, idempotency_key)
			VALUES ($1, NULL, $2, $3, 100000, 5000, 4000, 91000, 'HOLDING', $4)`,
			settlementID, merchantID, orderID, "econ012-settlement-"+settlementID.String()[:12])
	}
	econ012Exec(t, db, `
		INSERT INTO merchant_cancellation_fees (id, merchant_id, order_id, amount_idr, reason)
		VALUES ($1, $2, $3, 5000, 'merchant fault')`, feeID, merchantID, orderID)

	repo := NewMerchantCancellationFeeRepository(db, db)
	errs := make(chan error, len(settlementIDs))
	var wg sync.WaitGroup
	for _, settlementID := range settlementIDs {
		settlementID := settlementID
		wg.Add(1)
		go func() {
			defer wg.Done()
			errs <- repo.MarkDeducted(ctx, feeID, settlementID)
		}()
	}
	wg.Wait()
	close(errs)
	successes := 0
	for err := range errs {
		if err == nil {
			successes++
		}
	}
	var status string
	var settledBy uuid.UUID
	if err := db.QueryRowContext(ctx, `
		SELECT status, deducted_from_settlement_id
		FROM merchant_cancellation_fees WHERE id = $1`, feeID).Scan(&status, &settledBy); err != nil {
		t.Fatalf("read cancellation fee claim: %v", err)
	}
	if successes != 1 || status != "DEDUCTED" || (settledBy != settlementIDs[0] && settledBy != settlementIDs[1]) {
		t.Fatalf("cancellation fee claim was not serialized: successes=%d status=%s settlement=%s", successes, status, settledBy)
	}
}

func TestECON012MerchantCommissionSnapshotSurvivesContractChange(t *testing.T) {
	db := econ012TestDB(t)
	ctx := context.Background()
	customerID, merchantUserID := uuid.New(), uuid.New()
	merchantID, orderID, contractAID, contractBID := uuid.New(), uuid.New(), uuid.New(), uuid.New()
	originalPolicy, originalPolicyErr := currentPolicyVersion(ctx, db)
	if originalPolicyErr != nil {
		t.Fatalf("read pricing policy version: %v", originalPolicyErr)
	}
	defer func() {
		if originalPolicy != "" {
			_, _ = db.ExecContext(ctx, `UPDATE system_configs SET value = $1::jsonb WHERE key = 'pricing_rule_version'`, originalPolicy)
		}
		_, _ = db.ExecContext(ctx, `DELETE FROM merchant_commission_contracts WHERE id IN ($1, $2)`, contractAID, contractBID)
		_, _ = db.ExecContext(ctx, `DELETE FROM orders WHERE id = $1`, orderID)
		_, _ = db.ExecContext(ctx, `DELETE FROM merchants WHERE id = $1`, merchantID)
		_, _ = db.ExecContext(ctx, `DELETE FROM users WHERE id IN ($1, $2)`, customerID, merchantUserID)
	}()

	econ012Exec(t, db, `
		INSERT INTO users (id, phone_number, full_name, role)
		VALUES ($1, $2, 'ECON012 snapshot customer', 'customer'),
		       ($3, $4, 'ECON012 snapshot merchant', 'customer')`,
		customerID, "+628"+customerID.String()[:12], merchantUserID, "+628"+merchantUserID.String()[:12])
	econ012Exec(t, db, `
		INSERT INTO merchants (id, user_id, nama_toko, alamat, is_open, verification_status)
		VALUES ($1, $2, 'ECON012 Snapshot Store', 'Jakarta', TRUE, 'approved')`, merchantID, merchantUserID)
	now := time.Now().UTC()
	econ012Exec(t, db, `
		INSERT INTO merchant_commission_contracts
			(id, merchant_id, market_code, service_code, contract_version, commission_basis,
			 commission_percent, fixed_fee_idr, effective_from, status,
			 approval_reference, approved_by, approved_at, created_by)
		VALUES ($1, $2, 'ID-JK', 'food_delivery', 'econ012-a', 'item_subtotal',
			 5.0, 0, $3, 'approved', 'econ012-approval-a', $4, $3, $5)`,
		contractAID, merchantID, now.Add(-time.Hour), merchantUserID, customerID)
	econ012Exec(t, db, `
		INSERT INTO orders
			(id, order_number, customer_id, merchant_id, model, status, pickup_location, pickup_address,
			 dropoff_location, dropoff_address, base_price_idr, total_price_idr, ppn_idr, mdr_idr,
			 service_category, service_sub_type, service_code, pricing_snapshot)
		VALUES ($1, $2, $3, $4, 'p2p', 'delivered',
			 ST_SetSRID(ST_MakePoint(106.8, -6.2), 4326), 'pickup',
			 ST_SetSRID(ST_MakePoint(106.81, -6.21), 4326), 'dropoff',
			 100000, 105000, 0, 0, 'food', 'food_delivery', 'food_delivery',
			 '{"market":"ID-JK","subtotal_idr":100000,"pricing_rule_version":"policy-A"}'::jsonb)`,
		orderID, "ECON012-SNAPSHOT-"+orderID.String()[:8], customerID, merchantID)

	var contractVersion string
	var commission int
	var pricingVersion string
	if err := db.QueryRowContext(ctx, `
		SELECT settlement_snapshot->'merchant_commercial_terms'->>'contract_version',
		       (settlement_snapshot->'merchant_commercial_terms'->>'commission_idr')::int,
		       pricing_snapshot->>'pricing_rule_version'
		FROM orders WHERE id = $1`, orderID).Scan(&contractVersion, &commission, &pricingVersion); err != nil {
		t.Fatalf("read initial economics snapshot: %v", err)
	}
	if contractVersion != "econ012-a" || commission != 5000 || pricingVersion != "policy-A" {
		t.Fatalf("initial snapshot mismatch: contract=%s commission=%d pricing=%s", contractVersion, commission, pricingVersion)
	}

	econ012Exec(t, db, `UPDATE merchant_commission_contracts SET status = 'retired' WHERE id = $1`, contractAID)
	econ012Exec(t, db, `
		INSERT INTO merchant_commission_contracts
			(id, merchant_id, market_code, service_code, contract_version, commission_basis,
			 commission_percent, fixed_fee_idr, effective_from, status,
			 approval_reference, approved_by, approved_at, created_by)
		VALUES ($1, $2, 'ID-JK', 'food_delivery', 'econ012-b', 'item_subtotal',
			 25.0, 0, $3, 'approved', 'econ012-approval-b', $4, $3, $5)`,
		contractBID, merchantID, now.Add(time.Minute), merchantUserID, customerID)
	// Simulate a later policy publish. The persisted order snapshot must remain
	// the version and commercial terms selected at checkout.
	econ012Exec(t, db, `UPDATE system_configs SET value = '"policy-B"'::jsonb WHERE key = 'pricing_rule_version'`)
	if err := db.QueryRowContext(ctx, `
		SELECT settlement_snapshot->'merchant_commercial_terms'->>'contract_version',
		       (settlement_snapshot->'merchant_commercial_terms'->>'commission_idr')::int,
		       pricing_snapshot->>'pricing_rule_version'
		FROM orders WHERE id = $1`, orderID).Scan(&contractVersion, &commission, &pricingVersion); err != nil {
		t.Fatalf("read historical economics snapshot: %v", err)
	}
	if contractVersion != "econ012-a" || commission != 5000 || pricingVersion != "policy-A" {
		t.Fatalf("historical order was repriced: contract=%s commission=%d pricing=%s", contractVersion, commission, pricingVersion)
	}
}

func currentPolicyVersion(ctx context.Context, db *sql.DB) (string, error) {
	var value string
	err := db.QueryRowContext(ctx, `SELECT value::text FROM system_configs WHERE key = 'pricing_rule_version'`).Scan(&value)
	return value, err
}

// pqUUIDArray keeps the test dependency surface small while still using a
// parameterized array for cleanup.
func pqUUIDArray(ids []uuid.UUID) any {
	values := make([]string, len(ids))
	for i, id := range ids {
		values[i] = id.String()
	}
	return pq.Array(values)
}
