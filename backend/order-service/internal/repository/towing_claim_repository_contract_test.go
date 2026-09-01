package repository

import (
	"context"
	"database/sql"
	"strings"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"tembus/order-service/internal/domain"
)

func TestCreateTowingDamageClaimRejectsMissingSameVehicleBinding(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create sqlmock: %v", err)
	}
	defer db.Close()

	mock.ExpectBegin()
	mock.ExpectExec("SELECT pg_advisory_xact_lock").WithArgs("towing_damage_claim:order-1").WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectQuery("SELECT tr.id, ol.vehicle_id").WithArgs("order-1", "operator-1").WillReturnError(sql.ErrNoRows)
	mock.ExpectRollback()

	repo := NewTowingDamageClaimRepository(db)
	_, err = repo.CreateTowingDamageClaim(context.Background(), &domain.SubmitTowingDamageClaimRequest{OrderID: "order-1", Severity: "major", ClaimAmountIDR: 500000}, "operator-1")
	if err == nil || !strings.Contains(err.Error(), "kendaraan") {
		t.Fatalf("expected missing same-vehicle binding error, got %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet SQL expectations: %v", err)
	}
}
