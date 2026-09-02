package repository

import (
	"context"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"tembus/order-service/internal/domain"
)

func TestUpdateStatusOptimisticUsesExpectedStateVersion(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create sqlmock: %v", err)
	}
	defer db.Close()

	mock.ExpectExec("UPDATE orders").
		WithArgs(domain.StatusSearching, sqlmock.AnyArg(), "order-1", int64(3)).
		WillReturnResult(sqlmock.NewResult(0, 1))

	repo := NewPostgresRepository(db, db, nil)
	updated, err := repo.UpdateStatusOptimistic(context.Background(), "order-1", domain.StatusSearching, 3)
	if err != nil {
		t.Fatalf("optimistic update failed: %v", err)
	}
	if !updated {
		t.Fatal("expected one row to be updated")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet SQL expectations: %v", err)
	}
}

func TestUpdateStatusOptimisticReportsLostRace(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create sqlmock: %v", err)
	}
	defer db.Close()

	mock.ExpectExec("UPDATE orders").
		WithArgs(domain.StatusDelivered, sqlmock.AnyArg(), "order-1", int64(4)).
		WillReturnResult(sqlmock.NewResult(0, 0))

	repo := NewPostgresRepository(db, db, nil)
	updated, err := repo.UpdateStatusOptimistic(context.Background(), "order-1", domain.StatusDelivered, 4)
	if err != nil {
		t.Fatalf("lost race should be represented by false result, got error: %v", err)
	}
	if updated {
		t.Fatal("expected compare-and-set to report no update")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet SQL expectations: %v", err)
	}
}
