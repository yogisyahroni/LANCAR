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

// Opt-in integration coverage for the local PostgreSQL database. It proves
// the merchant Ads purchase, append-only spend entry, ownership boundary, and
// idempotent replay against the real repository.
func TestMerchantAdsIntegration(t *testing.T) {
	dsn := os.Getenv("TEMBUS_MERCHANT_ADS_TEST_DATABASE_URL")
	merchantID := os.Getenv("TEMBUS_MERCHANT_ADS_TEST_MERCHANT_ID")
	userID := os.Getenv("TEMBUS_MERCHANT_ADS_TEST_USER_ID")
	if dsn == "" || merchantID == "" || userID == "" {
		t.Skip("requires TEMBUS_MERCHANT_ADS_TEST_DATABASE_URL, merchant and owner fixture IDs")
	}

	db, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Ping(); err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	creditKey := "merchant-ads-integration-credit-" + uuid.NewString()
	idempotencyKey := "merchant-ads-integration-" + uuid.NewString()
	var campaignID, purchaseID string

	cleanup := func() {
		if purchaseID == "" && campaignID != "" {
			_ = db.QueryRowContext(ctx, `SELECT id::text FROM merchant_ad_purchases WHERE campaign_id = $1`, campaignID).Scan(&purchaseID)
		}
		_, _ = db.ExecContext(ctx, `ALTER TABLE merchant_statement_entries DISABLE TRIGGER trg_prevent_merchant_statement_mutation`)
		if purchaseID != "" {
			_, _ = db.ExecContext(ctx, `DELETE FROM merchant_statement_entries WHERE source_type = 'merchant_ad_purchase' AND source_id = $1`, purchaseID)
		}
		_, _ = db.ExecContext(ctx, `DELETE FROM merchant_statement_entries WHERE idempotency_key = $1`, creditKey)
		_, _ = db.ExecContext(ctx, `ALTER TABLE merchant_statement_entries ENABLE TRIGGER trg_prevent_merchant_statement_mutation`)
		if campaignID != "" {
			_, _ = db.ExecContext(ctx, `DELETE FROM promo_audit_events WHERE campaign_id = $1`, campaignID)
			_, _ = db.ExecContext(ctx, `DELETE FROM merchant_ad_purchases WHERE campaign_id = $1`, campaignID)
			_, _ = db.ExecContext(ctx, `DELETE FROM promo_campaigns WHERE id = $1`, campaignID)
		}
		_ = db.Close()
	}
	t.Cleanup(cleanup)

	var marketCode, currencyCode string
	var minorUnit int
	if err := db.QueryRowContext(ctx, `
		SELECT market_code, currency_code, currency_minor_unit
		FROM merchant_financial_context($1)`, merchantID).Scan(&marketCode, &currencyCode, &minorUnit); err != nil {
		t.Fatalf("merchant financial context: %v", err)
	}
	if _, err := db.ExecContext(ctx, `SELECT append_merchant_statement_entry(
		$1::uuid, $2::text, $3::text, $4::smallint, 'adjustment', 'credit',
		200000::bigint, TRUE, 'integration_fixture', $5::text,
		NULL::uuid, NULL::uuid, NULL::uuid, NULL::uuid, NOW(),
		'Ads integration fixture balance', '{}'::jsonb, $6::text)`,
		merchantID, marketCode, currencyCode, minorUnit, creditKey, creditKey); err != nil {
		t.Fatalf("seed merchant balance: %v", err)
	}

	start := time.Now().UTC().Add(2 * time.Minute)
	firstRequest := &domain.MerchantAd{
		MerchantID: merchantID, ProductType: "ads", Name: "Integration Ads",
		Description: "Visibility only", Status: "active",
		CreativeHeadline: "Menu favorit dekat kamu", CreativeBody: "Pesan menu pilihan hari ini",
		TotalBudgetIDR: 100000, DailyBudgetIDR: 20000,
		StartsAt: start, EndsAt: start.Add(7 * 24 * time.Hour),
	}
	repo := NewPostgresMerchantAdsRepository(db, db)
	testFingerprint := strings.Repeat("a", 64)
	created, err := repo.Create(ctx, firstRequest, idempotencyKey, testFingerprint, userID)
	if err != nil {
		t.Fatalf("create merchant Ads: %v", err)
	}
	campaignID = created.ID
	if created.ProductType != "ads" || created.Status != "scheduled" || created.ChargedAmountIDR != 100000 {
		t.Fatalf("unexpected Ads purchase result: %+v", created)
	}

	var productType, ownerID string
	var discountValue, maxDiscount, minOrder int64
	var discountPercent float64
	if err := db.QueryRowContext(ctx, `SELECT product_type, merchant_id::text,
		discount_value_idr, discount_percent, max_discount_idr, min_order_idr
		FROM promo_campaigns WHERE id = $1`, campaignID).Scan(
		&productType, &ownerID, &discountValue, &discountPercent, &maxDiscount, &minOrder); err != nil {
		t.Fatal(err)
	}
	if productType != "ads" || ownerID != merchantID || discountValue != 0 || discountPercent != 0 || maxDiscount != 0 || minOrder != 0 {
		t.Fatalf("Ads boundary tidak tersimpan: type=%s owner=%s discounts=%d/%.3f/%d/%d", productType, ownerID, discountValue, discountPercent, maxDiscount, minOrder)
	}

	replay, err := repo.Create(ctx, &domain.MerchantAd{MerchantID: merchantID}, idempotencyKey, testFingerprint, userID)
	if err != nil {
		t.Fatalf("idempotent Ads replay: %v", err)
	}
	if replay.ID != created.ID {
		t.Fatalf("idempotent replay created a second campaign: %s != %s", replay.ID, created.ID)
	}

	listed, total, err := repo.ListByMerchant(ctx, merchantID, 20, 0)
	if err != nil {
		t.Fatalf("list merchant Ads: %v", err)
	}
	if total != 1 || len(listed) != 1 || listed[0].ID != created.ID {
		t.Fatalf("merchant Ads ownership list mismatch: total=%d items=%+v", total, listed)
	}
	performance, err := repo.Performance(ctx, merchantID, "daily")
	if err != nil {
		t.Fatalf("merchant marketing performance: %v", err)
	}
	if performance.Paid.SpendIDR != 100000 {
		t.Fatalf("paid spend should be separate and authoritative: %+v", performance.Paid)
	}

	var spendCount int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM merchant_statement_entries
		WHERE source_type = 'merchant_ad_purchase' AND source_id = (SELECT id::text FROM merchant_ad_purchases WHERE campaign_id = $1)
		  AND entry_type = 'ads_spend' AND direction = 'debit'`, campaignID).Scan(&spendCount); err != nil {
		t.Fatal(err)
	}
	if spendCount != 1 {
		t.Fatalf("expected one append-only Ads spend entry, got %d", spendCount)
	}
}
