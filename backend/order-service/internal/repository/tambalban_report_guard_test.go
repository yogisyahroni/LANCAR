package repository

import (
	"context"
	"database/sql"
	"errors"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"tembus/order-service/internal/domain"
)

func TestCreateTambalBanReportRejectsUnassignedCourier(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create sqlmock: %v", err)
	}
	defer db.Close()

	repo := NewServiceReportRepository(db)
	mock.ExpectBegin()
	mock.ExpectExec("SELECT pg_advisory_xact_lock").
		WithArgs("tambal_ban_report:order-1").
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectQuery("SELECT o.status").
		WithArgs("order-1", "courier-user-1").
		WillReturnError(sql.ErrNoRows)
	mock.ExpectRollback()

	err = repo.CreateTambalBanReport(context.Background(), &domain.TambalBanReport{
		OrderID:   "order-1",
		CourierID: "courier-user-1",
	})
	if !errors.Is(err, domain.ErrInvalidServiceReport) {
		t.Fatalf("expected invalid service report for unassigned courier, got %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sql expectations: %v", err)
	}
}

func TestCreateTambalBanReportRequiresFinalProofForFirstReport(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create sqlmock: %v", err)
	}
	defer db.Close()

	repo := NewServiceReportRepository(db)
	mock.ExpectBegin()
	mock.ExpectExec("SELECT pg_advisory_xact_lock").
		WithArgs("tambal_ban_report:order-1").
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectQuery("SELECT o.status").
		WithArgs("order-1", "courier-user-1").
		WillReturnRows(sqlmock.NewRows([]string{"status"}).AddRow(string(domain.StatusPickedUp)))
	mock.ExpectQuery("SELECT id, created_at").
		WithArgs("order-1").
		WillReturnError(sql.ErrNoRows)
	mock.ExpectRollback()

	err = repo.CreateTambalBanReport(context.Background(), &domain.TambalBanReport{
		OrderID:   "order-1",
		CourierID: "courier-user-1",
	})
	if !errors.Is(err, domain.ErrInvalidServiceReport) {
		t.Fatalf("expected invalid service report before final-proof stage, got %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sql expectations: %v", err)
	}
}

func TestCreateTambalBanReportAllowsAssignedIdempotentReplayAfterDelivered(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("create sqlmock: %v", err)
	}
	defer db.Close()

	repo := NewServiceReportRepository(db)
	createdAt := time.Date(2026, 9, 6, 5, 0, 0, 0, time.UTC)

	mock.ExpectBegin()
	mock.ExpectExec("SELECT pg_advisory_xact_lock").
		WithArgs("tambal_ban_report:order-1").
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectQuery("SELECT o.status").
		WithArgs("order-1", "courier-user-1").
		WillReturnRows(sqlmock.NewRows([]string{"status"}).AddRow(string(domain.StatusDelivered)))
	mock.ExpectQuery("SELECT id, created_at").
		WithArgs("order-1").
		WillReturnRows(sqlmock.NewRows([]string{"id", "created_at"}).AddRow("report-1", createdAt))
	mock.ExpectCommit()

	report := &domain.TambalBanReport{
		OrderID:   "order-1",
		CourierID: "courier-user-1",
	}
	if err := repo.CreateTambalBanReport(context.Background(), report); err != nil {
		t.Fatalf("expected idempotent replay to succeed, got %v", err)
	}
	if report.ID != "report-1" || !report.CreatedAt.Equal(createdAt) {
		t.Fatalf("expected existing report to be returned, got id=%q created_at=%v", report.ID, report.CreatedAt)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sql expectations: %v", err)
	}
}
