package repository

import (
	"context"
	"errors"
	"testing"
	"tembus/order-service/internal/domain"

	"github.com/DATA-DOG/go-sqlmock"
)

func TestServiceAdjustmentDecisionRejectsWrongCustomer(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	defer db.Close()

	repo := NewServiceAdjustmentRepository(db)
	req := &domain.DecideServiceAdjustmentRequest{
		AdjustmentID:       "adj-1",
		Decision:           "approve",
		IdempotencyKey:     "decision-key-wrong-customer",
		RequestFingerprint: "decision-hash-wrong-customer",
		CorrelationID:      "corr-auth",
	}

	mock.ExpectBegin()
	mock.ExpectExec(`SELECT pg_advisory_xact_lock\(hashtext\(\$1\)\)`).
		WithArgs("service_adjustment_decision:adj-1").
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectQuery(`(?s)SELECT .*FROM service_adjustments sa.*FOR UPDATE OF sa, o`).
		WithArgs("adj-1", "customer-2").
		WillReturnRows(sqlmock.NewRows(serviceAdjustmentTestColumns("total_price_idr", "decision_idempotency_key", "decision_request_hash")))
	mock.ExpectRollback()

	_, err = repo.Decide(context.Background(), req, "customer-2")
	if !errors.Is(err, domain.ErrServiceAdjustmentForbidden) {
		t.Fatalf("Decide() error = %v, want ErrServiceAdjustmentForbidden", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet SQL expectations: %v", err)
	}
}
