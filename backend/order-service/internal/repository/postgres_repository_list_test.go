package repository

import (
	"context"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
)

// This is a SQL contract regression test for legacy orders. The production
// database contains orders created before the minor-unit and distance columns
// were made consistently populated, so ListByUserID must normalize nullable
// numeric/text values before scanning them into the canonical domain model.
func TestListByUserIDNormalizesLegacyNullablePricingColumns(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create sqlmock: %v", err)
	}
	defer db.Close()

	createdAt := time.Date(2026, 9, 14, 0, 0, 0, 0, time.UTC)
	rows := sqlmock.NewRows([]string{
		"id", "order_number", "customer_id", "model", "status",
		"pickup_lat", "pickup_lng", "pickup_address", "dropoff_lat", "dropoff_lng", "dropoff_address",
		"length", "width", "height", "weight", "item_description", "item_image_url",
		"distance_km", "base_price_idr", "volumetric_surcharge_idr", "dynamic_price_idr", "total_price_idr",
		"handover_token", "dispatch_expiry", "batch_id", "sequence_no", "courier_id", "created_at", "updated_at",
		"currency_code", "currency_minor_unit", "base_price_minor", "distance_fee_minor",
		"volumetric_surcharge_minor", "dynamic_price_minor", "discount_minor", "insurance_premium_minor",
		"platform_fee_minor", "promo_subsidy_minor", "total_price_minor", "dpp_minor", "ppn_minor",
		"tax_rule_version", "tax_jurisdiction",
	}).AddRow(
		"order-1", "ORD-1", "user-1", "motor", "searching",
		-6.2, 106.8, "pickup", -6.3, 106.9, "dropoff",
		0, 0, 0, 0, "", "",
		0, 0, 0, 0, 0, "", createdAt, "", 0, "", createdAt, createdAt,
		"IDR", 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, "", "",
	)

	// Keep the expectation tied to the exact null-normalization contract that
	// prevents database/sql from attempting to scan NULL into primitive fields.
	mock.ExpectQuery(`SELECT[\s\S]*COALESCE\(distance_km, 0\)[\s\S]*COALESCE\(base_price_idr, 0\)[\s\S]*COALESCE\(volumetric_surcharge_idr, 0\)[\s\S]*COALESCE\(dynamic_price_idr, 0\)[\s\S]*COALESCE\(total_price_idr, 0\)[\s\S]*COALESCE\(currency_code, 'IDR'\)`).
		WithArgs("user-1").
		WillReturnRows(rows)

	repo := NewPostgresRepository(db, db, nil)
	orders, err := repo.ListByUserID(context.Background(), "user-1", nil)
	if err != nil {
		t.Fatalf("list legacy order: %v", err)
	}
	if len(orders) != 1 {
		t.Fatalf("expected one order, got %d", len(orders))
	}
	if orders[0].DistanceKM != 0 || orders[0].Currency != "IDR" {
		t.Fatalf("unexpected normalized order: %+v", orders[0])
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet SQL expectations: %v", err)
	}
}
