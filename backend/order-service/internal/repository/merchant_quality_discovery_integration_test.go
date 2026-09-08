package repository

import (
	"context"
	"database/sql"
	"os"
	"testing"

	_ "github.com/lib/pq"
	"tembus/order-service/internal/domain"
)

// Opt-in shared-PostgreSQL proof that the discovery repository honors the
// explicit merchant quality policy for organic search. Ads uses the same
// database eligibility function in the sponsored lateral query.
func TestMerchantQualityDiscoveryEligibilityIntegration(t *testing.T) {
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
		t.Fatal(err)
	}
	ctx := context.Background()
	var originalApplySearch, originalApplyAds bool
	var originalMinimum int
	if err := db.QueryRowContext(ctx, `
		SELECT apply_to_search, apply_to_ads, minimum_orders
		FROM merchant_quality_policies
		WHERE policy_version = 'merchant-quality-v1' AND market_code = '*'`).
		Scan(&originalApplySearch, &originalApplyAds, &originalMinimum); err != nil {
		db.Close()
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = db.ExecContext(ctx, `UPDATE merchant_quality_policies
			SET apply_to_search = $1, apply_to_ads = $2, minimum_orders = $3
			WHERE policy_version = 'merchant-quality-v1' AND market_code = '*'`,
			originalApplySearch, originalApplyAds, originalMinimum)
		_ = db.Close()
	})

	var lat, lng float64
	if err := db.QueryRowContext(ctx, `SELECT ST_Y(lokasi::geometry), ST_X(lokasi::geometry) FROM merchants WHERE id = $1`, merchantID).Scan(&lat, &lng); err != nil {
		t.Fatal(err)
	}
	foodRepo := NewFoodRepository(db, db, nil)
	visible, err := foodRepo.ListFoodMerchants(ctx, lat, lng, "", "all", 50)
	if err != nil {
		t.Fatalf("initial food discovery: %v", err)
	}
	if !containsMerchant(visible, merchantID) {
		t.Fatal("fixture merchant should be visible while quality policy gate is disabled")
	}
	if _, err := db.ExecContext(ctx, `UPDATE merchant_quality_policies
		SET apply_to_search = TRUE, minimum_orders = 999
		WHERE policy_version = 'merchant-quality-v1' AND market_code = '*'`); err != nil {
		t.Fatal(err)
	}
	hidden, err := foodRepo.ListFoodMerchants(ctx, lat, lng, "", "all", 50)
	if err != nil {
		t.Fatalf("gated food discovery: %v", err)
	}
	if containsMerchant(hidden, merchantID) {
		t.Fatal("explicit quality policy should remove below-volume merchant from search")
	}
	if _, err := db.ExecContext(ctx, `UPDATE merchant_quality_policies
		SET apply_to_search = FALSE, minimum_orders = 0
		WHERE policy_version = 'merchant-quality-v1' AND market_code = '*'`); err != nil {
		t.Fatal(err)
	}
}

func containsMerchant(merchants []domain.FoodMerchantInfo, merchantID string) bool {
	for _, merchant := range merchants {
		if merchant.ID == merchantID {
			return true
		}
	}
	return false
}
