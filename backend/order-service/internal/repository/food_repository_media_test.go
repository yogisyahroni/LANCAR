package repository

import (
	"context"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
)

func TestFoodRepositoryReadsMerchantProfileMedia(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create sqlmock: %v", err)
	}
	defer db.Close()

	rows := sqlmock.NewRows([]string{
		"id", "nama_toko", "alamat", "is_open", "auto_accept_orders", "operating_state",
		"operating_state_reason", "operating_state_until", "operating_timezone", "verification_status",
		"paused_until", "busy_until", "busy_extra_prep_minutes", "min_order_idr", "lat", "lng",
		"jam_buka", "jam_tutup", "last_order_minutes_before_close", "halal_status", "banner_url",
		"logo_url", "enforcement_active",
	}).AddRow(
		"merchant-1", "Warung Test", "Jl. Test", true, true, "open",
		nil, nil, "Asia/Jakarta", "approved",
		nil, nil, 0, int64(0), -6.2, 106.8,
		"08:00", "22:00", 30, "halal_certified", "https://cdn.example/banner.jpg",
		"https://cdn.example/logo.jpg", false,
	)

	mock.ExpectQuery(`(?s)SELECT.*merchant_profile_details.*FROM merchants.*WHERE id = \$1`).
		WithArgs("merchant-1").
		WillReturnRows(rows)

	merchant, err := NewFoodRepository(db, db, nil).GetFoodMerchant(context.Background(), "merchant-1")
	if err != nil {
		t.Fatalf("GetFoodMerchant: %v", err)
	}
	if merchant.BannerURL != "https://cdn.example/banner.jpg" || merchant.LogoURL != "https://cdn.example/logo.jpg" {
		t.Fatalf("merchant profile media not projected: banner=%q logo=%q", merchant.BannerURL, merchant.LogoURL)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations: %v", err)
	}
}
