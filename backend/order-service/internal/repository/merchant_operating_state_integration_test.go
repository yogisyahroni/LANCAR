package repository

import (
	"database/sql"
	"os"
	"testing"

	_ "github.com/lib/pq"
)

func TestFoodRepositoryReadsCanonicalOperatingState(t *testing.T) {
	dsn := os.Getenv("TEMBUS_ORDER_SERVICE_TEST_DATABASE_URL")
	merchantID := os.Getenv("TEMBUS_OPERATING_STATE_TEST_MERCHANT_ID")
	if dsn == "" || merchantID == "" {
		t.Skip("requires TEMBUS_ORDER_SERVICE_TEST_DATABASE_URL and TEMBUS_OPERATING_STATE_TEST_MERCHANT_ID")
	}
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err := db.Ping(); err != nil {
		t.Fatal(err)
	}

	repo := NewFoodRepository(db, db, nil)
	merchant, err := repo.GetFoodMerchant(t.Context(), merchantID)
	if err != nil {
		t.Fatalf("GetFoodMerchant: %v", err)
	}
	if merchant.OperatingState == "" || merchant.OperatingTimezone == "" {
		t.Fatalf("canonical operating fields missing: %+v", merchant)
	}
	if merchant.OperatingState != "open" && merchant.OperatingState != "busy" {
		t.Skip("fixture is not discovery-eligible; read contract already verified")
	}

	merchants, err := repo.ListFoodMerchants(t.Context(), merchant.Lat, merchant.Lng, "", "", 100)
	if err != nil {
		t.Fatalf("ListFoodMerchants: %v", err)
	}
	for _, candidate := range merchants {
		if candidate.ID == merchantID {
			if candidate.OperatingState != merchant.OperatingState {
				t.Fatalf("discovery state %q differs from detail state %q", candidate.OperatingState, merchant.OperatingState)
			}
			return
		}
	}
	t.Fatalf("eligible merchant %s was not returned by discovery", merchantID)
}
