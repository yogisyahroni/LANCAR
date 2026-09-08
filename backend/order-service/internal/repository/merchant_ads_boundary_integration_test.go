package repository

import (
	"context"
	"database/sql"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	_ "github.com/lib/pq"
	"tembus/order-service/internal/domain"
)

// Opt-in PostgreSQL proof that only product_type=ads can receive sponsored
// discovery attribution and placement. A product_type=promo campaign with the
// same discovery metadata remains invisible to the paid path.
func TestMerchantAdsBoundaryIntegration(t *testing.T) {
	dsn := os.Getenv("TEMBUS_MERCHANT_ADS_TEST_DATABASE_URL")
	merchantID := os.Getenv("TEMBUS_MERCHANT_ADS_TEST_MERCHANT_ID")
	userID := os.Getenv("TEMBUS_MERCHANT_ADS_TEST_USER_ID")
	if dsn == "" || merchantID == "" || userID == "" {
		t.Skip("requires TEMBUS_MERCHANT_ADS_TEST_DATABASE_URL, merchant and user fixture IDs")
	}

	db, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Ping(); err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	adsID := uuid.NewString()
	promoID := uuid.NewString()
	adsCode := "ADS-BOUNDARY-" + uuid.NewString()[:8]
	promoCode := "PROMO-BOUNDARY-" + uuid.NewString()[:8]
	start := time.Now().UTC().Add(-time.Minute)
	end := time.Now().UTC().Add(time.Hour)

	t.Cleanup(func() {
		_, _ = db.ExecContext(ctx, `DELETE FROM food_discovery_ad_events WHERE campaign_id IN ($1, $2)`, adsID, promoID)
		_, _ = db.ExecContext(ctx, `DELETE FROM promo_campaigns WHERE id IN ($1, $2)`, adsID, promoID)
		_ = db.Close()
	})

	insert := `
		INSERT INTO promo_campaigns (
			id, code, name, status, product_type, merchant_id, discount_type,
			discount_value_idr, discount_percent, max_discount_idr, min_order_idr,
			service_codes, starts_at, ends_at, audience_rules, creative_headline
		) VALUES ($1, $2, $3, 'active', $4, $5, 'shipping_discount', $6, $7, 0, 0,
			$8::text[], $9, $10, $11::jsonb, $12)`
	if _, err := db.ExecContext(ctx, insert, adsID, adsCode, "Boundary Ads", "ads", merchantID, 0, 0, []string{"food_delivery"}, start, end,
		`{"placement":"food_discovery","merchant_id":"`+merchantID+`"}`, "Menu pilihan dekat kamu"); err != nil {
		t.Fatalf("insert Ads fixture: %v", err)
	}
	if _, err := db.ExecContext(ctx, insert, promoID, promoCode, "Boundary Promo", "promo", nil, 1000, 10, []string{"food_delivery"}, start, end,
		`{"placement":"food_discovery","merchant_id":"`+merchantID+`"}`, "Promo menu"); err != nil {
		t.Fatalf("insert promo fixture: %v", err)
	}

	var lat, lng float64
	if err := db.QueryRowContext(ctx, `SELECT ST_Y(lokasi::geometry), ST_X(lokasi::geometry) FROM merchants WHERE id = $1`, merchantID).Scan(&lat, &lng); err != nil {
		t.Fatal(err)
	}
	foodRepo := NewFoodRepository(db, db, nil)
	visible, err := foodRepo.ListFoodMerchants(ctx, lat, lng, "", "all", 50)
	if err != nil {
		t.Fatalf("food discovery: %v", err)
	}
	var found *domain.FoodMerchantInfo
	for i := range visible {
		if visible[i].ID == merchantID {
			found = &visible[i]
			break
		}
	}
	if found == nil || !found.IsSponsored || found.SponsoredCampaignID != adsID {
		t.Fatalf("organic/promo campaign crossed into paid placement: found=%+v", found)
	}

	sponsoredRepo := NewFoodSponsoredRepository(db)
	acceptedPromo, err := sponsoredRepo.RecordFoodSponsoredEvent(ctx, domain.FoodSponsoredEvent{
		CampaignID: promoID, MerchantID: merchantID, UserID: userID, EventType: "impression", SessionID: "promo-boundary-session",
	})
	if err != nil {
		t.Fatal(err)
	}
	if acceptedPromo {
		t.Fatal("promo campaign must not create paid attribution")
	}
	acceptedAds, err := sponsoredRepo.RecordFoodSponsoredEvent(ctx, domain.FoodSponsoredEvent{
		CampaignID: adsID, MerchantID: merchantID, UserID: userID, EventType: "impression", SessionID: "ads-boundary-session",
	})
	if err != nil {
		t.Fatal(err)
	}
	if !acceptedAds {
		t.Fatal("Ads campaign should create paid attribution")
	}
}
