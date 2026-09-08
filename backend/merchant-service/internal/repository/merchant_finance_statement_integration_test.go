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
)

// This test is intentionally opt-in because it exercises the shared local
// PostgreSQL database. It proves the real trigger projection and repository
// read path without claiming provider or staging behavior.
func TestMerchantFinanceStatementIntegration(t *testing.T) {
	dsn := os.Getenv("TEMBUS_MERCHANT_FINANCE_TEST_DATABASE_URL")
	merchantID := os.Getenv("TEMBUS_MERCHANT_FINANCE_TEST_MERCHANT_ID")
	orderID := os.Getenv("TEMBUS_MERCHANT_FINANCE_TEST_ORDER_ID")
	userID := os.Getenv("TEMBUS_MERCHANT_FINANCE_TEST_USER_ID")
	if dsn == "" || merchantID == "" || orderID == "" || userID == "" {
		t.Skip("requires TEMBUS_MERCHANT_FINANCE_TEST_DATABASE_URL, merchant/order/user fixture IDs")
	}

	db, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Ping(); err != nil {
		t.Fatal(err)
	}

	ctx := context.Background()
	settlementID := uuid.New()
	refundID := uuid.New()
	withdrawalID := uuid.New()
	withdrawalKey := uuid.New()
	settlementKey := "merchant-finance-integration-" + settlementID.String()
	adsKey := "merchant-finance-integration-ads-" + settlementID.String()
	adjustmentKey := "merchant-finance-integration-adjustment-" + settlementID.String()

	cleanup := func() {
		// Statement history is append-only in production. Test cleanup is scoped
		// to generated source markers and temporarily disables only the
		// protection trigger. The DB handle stays open until cleanup completes.
		_, _ = db.ExecContext(ctx, `ALTER TABLE merchant_statement_entries DISABLE TRIGGER trg_prevent_merchant_statement_mutation`)
		_, _ = db.ExecContext(ctx, `DELETE FROM merchant_statement_entries
			WHERE settlement_id IN (SELECT id FROM merchant_settlements WHERE idempotency_key LIKE 'merchant-finance-integration-%')
			   OR refund_id IN (SELECT id FROM refunds WHERE order_id = $1 AND reason = 'integration test')
			   OR withdrawal_id IN (SELECT id FROM merchant_withdrawal_requests WHERE merchant_id = $2 AND bank_name = 'Integration Bank')
			   OR (source_type IN ('ads_campaign', 'finance_adjustment') AND source_id IN ('integration-ads', 'integration-adjustment'))`, orderID, merchantID)
		_, _ = db.ExecContext(ctx, `ALTER TABLE merchant_statement_entries ENABLE TRIGGER trg_prevent_merchant_statement_mutation`)
		_, _ = db.ExecContext(ctx, `DELETE FROM refunds WHERE order_id = $1 AND reason = 'integration test'`, orderID)
		_, _ = db.ExecContext(ctx, `DELETE FROM merchant_withdrawal_requests WHERE merchant_id = $1 AND bank_name = 'Integration Bank'`, merchantID)
		_, _ = db.ExecContext(ctx, `DELETE FROM merchant_settlements WHERE idempotency_key LIKE 'merchant-finance-integration-%'`)
		_ = db.Close()
	}
	t.Cleanup(cleanup)

	if _, err := db.ExecContext(ctx, `
		INSERT INTO merchant_settlements (
			id, payment_link_id, merchant_id, order_id, gross_item_price_idr,
			merchant_fee_idr, disbursement_fee_idr, merchant_promo_discount_idr,
			net_payout_idr, status, idempotency_key, pod_confirmed_at,
			holding_release_at, metadata
		) VALUES ($1, NULL, $2, $3, 42000, 4000, 4000, 1000, 33000,
			'HOLDING', $4, NOW(), NOW(), '{}'::jsonb)`,
		settlementID, merchantID, orderID, settlementKey); err != nil {
		t.Fatalf("insert settlement: %v", err)
	}
	if _, err := db.ExecContext(ctx, `
		INSERT INTO refunds (
			id, order_id, user_id, amount_idr, reason, status,
			refund_percentage, tax_reversal_idr, platform_fee_reversal_idr,
			cancellation_fee_idr, cancellation_fee_breakdown, created_at, updated_at
		) VALUES ($1, $2, $3, 5000, 'integration test', 'pending', 10, 0, 0, 0,
			'{}'::jsonb, NOW(), NOW())`, refundID, orderID, userID); err != nil {
		t.Fatalf("insert refund: %v", err)
	}
	if _, err := db.ExecContext(ctx, `UPDATE refunds SET status = 'processed' WHERE id = $1`, refundID); err != nil {
		t.Fatalf("process refund: %v", err)
	}
	if _, err := db.ExecContext(ctx, `
		INSERT INTO merchant_withdrawal_requests (
			id, merchant_id, user_id, amount_idr, bank_name,
			bank_account_number, bank_account_holder, status, idempotency_key
		) VALUES ($1, $2, $3, 10000, 'Integration Bank', '123456789',
			'Integration Owner', 'pending', $4)`, withdrawalID, merchantID, userID, withdrawalKey); err != nil {
		t.Fatalf("insert withdrawal: %v", err)
	}
	if _, err := db.ExecContext(ctx, `UPDATE merchant_withdrawal_requests SET status = 'completed' WHERE id = $1`, withdrawalID); err != nil {
		t.Fatalf("complete withdrawal: %v", err)
	}
	appendEntry := `SELECT append_merchant_statement_entry(
		$1::uuid, 'id'::text, 'IDR'::text, 0::smallint, $2::text, $3::text,
		$4::bigint, $5::boolean, $6::text, $7::text,
		NULL::uuid, NULL::uuid, NULL::uuid, NULL::uuid, NOW(), $8::text,
		'{}'::jsonb, $9::text)`
	for _, entry := range []struct {
		typ, direction string
		amount         int64
		affects        bool
		sourceType     string
		sourceID       string
		description    string
		key            string
	}{
		{"ads_spend", "debit", 1200, true, "ads_campaign", "integration-ads", "Ads spend", adsKey},
		{"adjustment", "credit", 700, true, "finance_adjustment", "integration-adjustment", "Approved adjustment", adjustmentKey},
	} {
		if _, err := db.ExecContext(ctx, appendEntry, merchantID, entry.typ, entry.direction,
			entry.amount, entry.affects, entry.sourceType, entry.sourceID, entry.description, entry.key); err != nil {
			t.Fatalf("append %s: %v", entry.typ, err)
		}
	}

	financeRepo, ok := NewPostgresReportRepository(db, db).(domain.MerchantFinanceRepository)
	if !ok {
		t.Fatal("postgres report repository does not implement merchant finance repository")
	}
	statement, err := financeRepo.FinanceStatement(ctx, merchantID, 100)
	if err != nil {
		t.Fatalf("finance statement: %v", err)
	}
	if len(statement.Discrepancies) != 0 {
		t.Fatalf("unexpected settlement discrepancy: %+v", statement.Discrepancies)
	}
	if len(statement.Totals) != 1 {
		t.Fatalf("expected one currency bucket, got %+v", statement.Totals)
	}
	totals := statement.Totals[0]
	if totals.CurrencyCode != "IDR" || totals.CurrencyMinorUnit != 0 {
		t.Fatalf("unexpected currency context: %+v", totals)
	}
	if totals.SalesMinor != 42000 || totals.CommissionMinor != 4000 ||
		totals.PromoSubsidyMinor != 1000 || totals.FeeMinor != 4000 ||
		totals.RefundMinor != 5000 || totals.AdsSpendMinor != 1200 ||
		totals.AdjustmentMinor != 700 || totals.PayoutMinor != 10000 ||
		totals.NetBalanceMinor != 17500 {
		t.Fatalf("statement categories do not reconcile: %+v", totals)
	}
	if len(statement.Entries) != 8 {
		t.Fatalf("expected eight separated statement entries, got %d", len(statement.Entries))
	}
}

func TestMerchantBankAccountLifecycleIntegration(t *testing.T) {
	dsn := os.Getenv("TEMBUS_MERCHANT_FINANCE_TEST_DATABASE_URL")
	merchantID := os.Getenv("TEMBUS_MERCHANT_FINANCE_TEST_MERCHANT_ID")
	if dsn == "" || merchantID == "" {
		t.Skip("requires TEMBUS_MERCHANT_FINANCE_TEST_DATABASE_URL and merchant fixture ID")
	}

	db, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	ctx := context.Background()

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()

	var beforeVersion int64
	if err := tx.QueryRowContext(ctx, `
		SELECT bank_account_version
		FROM merchants
		WHERE id = $1
		FOR UPDATE`, merchantID).Scan(&beforeVersion); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.ExecContext(ctx, `
		UPDATE merchants
		SET bank_account_holder = 'Lifecycle Test ' || substr(md5(random()::text), 1, 8)
		WHERE id = $1`, merchantID); err != nil {
		t.Fatalf("change bank account: %v", err)
	}

	var verified bool
	var afterVersion int64
	var changedAt, cooldownUntil sql.NullTime
	if err := tx.QueryRowContext(ctx, `
		SELECT bank_account_verified, bank_account_version,
		       bank_account_changed_at, bank_account_cooldown_until
		FROM merchants
		WHERE id = $1`, merchantID).Scan(&verified, &afterVersion, &changedAt, &cooldownUntil); err != nil {
		t.Fatal(err)
	}
	if verified || afterVersion != beforeVersion+1 || !changedAt.Valid ||
		!cooldownUntil.Valid || !cooldownUntil.Time.After(time.Now()) {
		t.Fatalf("bank lifecycle policy not applied: verified=%v version=%d before=%d changed_at=%v cooldown=%v", verified, afterVersion, beforeVersion, changedAt.Valid, cooldownUntil)
	}

	var eventVersion int64
	if err := tx.QueryRowContext(ctx, `
		SELECT account_version
		FROM merchant_bank_account_events
		WHERE merchant_id = $1
		ORDER BY changed_at DESC
		LIMIT 1`, merchantID).Scan(&eventVersion); err != nil {
		t.Fatal(err)
	}
	if eventVersion != afterVersion {
		t.Fatalf("bank audit event version=%d, merchant version=%d", eventVersion, afterVersion)
	}
}

func TestMerchantFinanceDiscrepancyQueueIntegration(t *testing.T) {
	dsn := os.Getenv("TEMBUS_MERCHANT_FINANCE_TEST_DATABASE_URL")
	merchantID := os.Getenv("TEMBUS_MERCHANT_FINANCE_TEST_MERCHANT_ID")
	orderID := os.Getenv("TEMBUS_MERCHANT_FINANCE_TEST_ORDER_ID")
	if dsn == "" || merchantID == "" || orderID == "" {
		t.Skip("requires finance database and merchant/order fixture IDs")
	}

	db, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Ping(); err != nil {
		db.Close()
		t.Fatal(err)
	}
	ctx := context.Background()
	settlementID := uuid.New()
	settlementKey := "merchant-finance-discrepancy-integration-" + settlementID.String()
	t.Cleanup(func() {
		_, _ = db.ExecContext(ctx, `ALTER TABLE merchant_statement_entries DISABLE TRIGGER trg_prevent_merchant_statement_mutation`)
		_, _ = db.ExecContext(ctx, `DELETE FROM merchant_statement_entries WHERE settlement_id = $1`, settlementID)
		_, _ = db.ExecContext(ctx, `ALTER TABLE merchant_statement_entries ENABLE TRIGGER trg_prevent_merchant_statement_mutation`)
		_, _ = db.ExecContext(ctx, `DELETE FROM finance_reconciliation_exceptions WHERE reference_type = 'merchant_settlement' AND reference_id = $1`, settlementID.String())
		_, _ = db.ExecContext(ctx, `DELETE FROM merchant_settlements WHERE id = $1`, settlementID)
		_ = db.Close()
	})

	if _, err := db.ExecContext(ctx, `
		INSERT INTO merchant_settlements (
			id, payment_link_id, merchant_id, order_id, gross_item_price_idr,
			merchant_fee_idr, disbursement_fee_idr, merchant_promo_discount_idr,
			net_payout_idr, status, idempotency_key, pod_confirmed_at,
			holding_release_at, metadata
		) VALUES ($1, NULL, $2, $3, 42000, 4000, 4000, 1000, 32000,
			'HOLDING', $4, NOW(), NOW(), '{}'::jsonb)`,
		settlementID, merchantID, orderID, settlementKey); err != nil {
		t.Fatalf("insert mismatched settlement: %v", err)
	}

	financeRepo, ok := NewPostgresReportRepository(db, db).(domain.MerchantFinanceRepository)
	if !ok {
		t.Fatal("postgres report repository does not implement merchant finance repository")
	}
	statement, err := financeRepo.FinanceStatement(ctx, merchantID, 100)
	if err != nil {
		t.Fatalf("finance statement: %v", err)
	}
	for _, discrepancy := range statement.Discrepancies {
		if discrepancy.ReferenceID == settlementID.String() {
			if discrepancy.ExpectedMinor != 32000 || discrepancy.ActualMinor != 33000 ||
				discrepancy.DifferenceMinor != 1000 || discrepancy.Status != "open" {
				t.Fatalf("unexpected discrepancy: %+v", discrepancy)
			}
			return
		}
	}
	t.Fatalf("settlement %s was not exposed in discrepancy queue: %+v", settlementID, statement.Discrepancies)
}

func TestMerchantFinanceStatementAppendOnlyIntegration(t *testing.T) {
	dsn := os.Getenv("TEMBUS_MERCHANT_FINANCE_TEST_DATABASE_URL")
	merchantID := os.Getenv("TEMBUS_MERCHANT_FINANCE_TEST_MERCHANT_ID")
	if dsn == "" || merchantID == "" {
		t.Skip("requires TEMBUS_MERCHANT_FINANCE_TEST_DATABASE_URL and merchant fixture ID")
	}

	db, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Ping(); err != nil {
		db.Close()
		t.Fatal(err)
	}
	ctx := context.Background()
	entryKey := "merchant-finance-append-only-integration-" + uuid.New().String()
	t.Cleanup(func() {
		_, _ = db.ExecContext(ctx, `ALTER TABLE merchant_statement_entries DISABLE TRIGGER trg_prevent_merchant_statement_mutation`)
		_, _ = db.ExecContext(ctx, `DELETE FROM merchant_statement_entries WHERE idempotency_key = $1`, entryKey)
		_, _ = db.ExecContext(ctx, `ALTER TABLE merchant_statement_entries ENABLE TRIGGER trg_prevent_merchant_statement_mutation`)
		_ = db.Close()
	})

	if _, err := db.ExecContext(ctx, `
		SELECT append_merchant_statement_entry(
			$1::uuid, 'id'::text, 'IDR'::text, 0::smallint,
			'adjustment'::text, 'credit'::text, 125::bigint, TRUE,
			'finance_adjustment'::text, 'integration-immutability'::text,
			NULL::uuid, NULL::uuid, NULL::uuid, NULL::uuid, NOW(),
			'Immutable test adjustment'::text, '{}'::jsonb, $2::text)`, merchantID, entryKey); err != nil {
		t.Fatalf("append statement entry: %v", err)
	}
	var mutationErrors []string
	for _, query := range []string{
		`UPDATE merchant_statement_entries SET description = 'rewritten' WHERE idempotency_key = $1`,
		`DELETE FROM merchant_statement_entries WHERE idempotency_key = $1`,
	} {
		if _, err := db.ExecContext(ctx, query, entryKey); err == nil {
			t.Fatalf("statement mutation unexpectedly succeeded: %s", query)
		} else {
			mutationErrors = append(mutationErrors, err.Error())
		}
	}
	for _, mutationErr := range mutationErrors {
		if !strings.Contains(mutationErr, "append-only") {
			t.Fatalf("unexpected mutation error: %s", mutationErr)
		}
	}
}

func TestMerchantFinanceMarketCurrencyBoundaryIntegration(t *testing.T) {
	dsn := os.Getenv("TEMBUS_MERCHANT_FINANCE_TEST_DATABASE_URL")
	merchantID := os.Getenv("TEMBUS_MERCHANT_FINANCE_TEST_MERCHANT_ID")
	orderID := os.Getenv("TEMBUS_MERCHANT_FINANCE_TEST_ORDER_ID")
	if dsn == "" || merchantID == "" || orderID == "" {
		t.Skip("requires finance database and merchant/order fixture IDs")
	}

	db, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Ping(); err != nil {
		db.Close()
		t.Fatal(err)
	}
	ctx := context.Background()
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		db.Close()
		t.Fatal(err)
	}
	defer db.Close()
	defer tx.Rollback()

	marketCode := "zz-merch-finance-eur-test"
	settlementID := uuid.New()
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO courier_market_configs (
			market_code, country_code, currency_code, currency_minor_unit,
			timezone, display_locale, metadata
		) VALUES ($1, 'DE', 'EUR', 2, 'Europe/Berlin', 'de-DE', '{}'::jsonb)`, marketCode); err != nil {
		t.Fatalf("insert test market: %v", err)
	}
	if _, err := tx.ExecContext(ctx, `UPDATE merchants SET market_code = $1 WHERE id = $2`, marketCode, merchantID); err != nil {
		t.Fatalf("assign test market: %v", err)
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO merchant_settlements (
			id, payment_link_id, merchant_id, order_id,
			gross_item_price_idr, merchant_fee_idr, disbursement_fee_idr,
			merchant_promo_discount_idr, net_payout_idr,
			gross_item_price_minor, merchant_fee_minor, disbursement_fee_minor,
			merchant_promo_discount_minor, net_payout_minor,
			status, idempotency_key, pod_confirmed_at, holding_release_at, metadata
		) VALUES ($1, NULL, $2, $3, 0, 0, 0, 0, 0, 1250, 100, 100, 50, 1000,
			'HOLDING', $4, NOW(), NOW(), '{}'::jsonb)`,
		settlementID, merchantID, orderID, "merchant-finance-eur-test-"+settlementID.String()); err != nil {
		t.Fatalf("insert non-IDR settlement: %v", err)
	}

	var actualMarket, currency string
	var minorUnit int
	var grossMinor, netMinor int64
	if err := tx.QueryRowContext(ctx, `
		SELECT market_code, currency_code, currency_minor_unit,
		       gross_item_price_minor, net_payout_minor
		FROM merchant_settlements WHERE id = $1`, settlementID).Scan(
		&actualMarket, &currency, &minorUnit, &grossMinor, &netMinor); err != nil {
		t.Fatal(err)
	}
	if actualMarket != marketCode || currency != "EUR" || minorUnit != 2 || grossMinor != 1250 || netMinor != 1000 {
		t.Fatalf("non-IDR settlement context not preserved: market=%s currency=%s minor_unit=%d gross=%d net=%d", actualMarket, currency, minorUnit, grossMinor, netMinor)
	}
	var statementEntries int
	if err := tx.QueryRowContext(ctx, `
		SELECT count(*) FROM merchant_statement_entries WHERE settlement_id = $1`, settlementID).Scan(&statementEntries); err != nil {
		t.Fatal(err)
	}
	if statementEntries != 4 {
		t.Fatalf("expected four non-IDR statement entries, got %d", statementEntries)
	}
}
