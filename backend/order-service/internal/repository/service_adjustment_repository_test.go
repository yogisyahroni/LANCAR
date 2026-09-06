package repository

import (
	"context"
	"database/sql/driver"
	"errors"
	"regexp"
	"testing"
	"tembus/order-service/internal/domain"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
)

func serviceAdjustmentTestColumns(extra ...string) []string {
	columns := []string{
		"id", "order_id", "customer_id", "requested_by_courier_id",
		"service_category", "service_code", "service_sub_type", "reason", "items",
		"initial_quote_id", "initial_pricing_snapshot", "original_total_idr", "delta_idr",
		"proposed_total_idr", "approved_delta_idr", "status", "financial_state",
		"approved_by_customer_id", "approved_at", "rejected_by_customer_id", "rejected_at",
		"rejection_reason", "correlation_id", "created_at", "updated_at",
	}
	return append(columns, extra...)
}

func serviceAdjustmentTestRow(status, financialState string, approvedDelta int64, approvedBy driver.Value, approvedAt driver.Value) []driver.Value {
	now := time.Date(2026, 9, 6, 8, 0, 0, 0, time.UTC)
	return []driver.Value{
		"adj-1", "order-1", "customer-1", "courier-1",
		"tambal_ban", "tambal_ban", "tambal_ban_motor", "Patch tubeless dan valve baru",
		[]byte(`[{"code":"PATCH","label":"Patch tubeless","type":"material","quantity":2,"unit_price_idr":15000,"total_idr":30000},{"code":"LABOR","label":"Jasa tambahan","type":"labor","quantity":1,"unit_price_idr":20000,"total_idr":20000}]`),
		"quote-1", []byte(`{"source":"roadside_quote","total_price_idr":100000}`),
		int64(100000), int64(50000), int64(150000), approvedDelta, status, financialState,
		approvedBy, approvedAt, nil, nil, nil, "corr-1", now, now,
	}
}

func expectServiceAdjustmentDecisionLoad(mock sqlmock.Sqlmock, status, financialState string, approvedDelta int64, approvedBy driver.Value, approvedAt driver.Value, currentTotal int64, decisionKey, decisionHash string) {
	row := append(serviceAdjustmentTestRow(status, financialState, approvedDelta, approvedBy, approvedAt), currentTotal, decisionKey, decisionHash)
	mock.ExpectQuery(`(?s)SELECT .*FROM service_adjustments sa.*FOR UPDATE OF sa, o`).
		WithArgs("adj-1", "customer-1").
		WillReturnRows(sqlmock.NewRows(serviceAdjustmentTestColumns("total_price_idr", "decision_idempotency_key", "decision_request_hash")).AddRow(row...))
}

func TestServiceAdjustmentProposalSnapshotsAuthoritativeQuoteAtomically(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	defer db.Close()

	repo := NewServiceAdjustmentRepository(db)
	ctx := context.Background()
	req := &domain.ProposeServiceAdjustmentRequest{
		OrderID:            "order-1",
		Reason:             "Patch tubeless dan valve baru",
		Items:              []domain.ServiceAdjustmentItem{{Code: "PATCH", Label: "Patch tubeless", Type: "material", Quantity: 2, UnitPriceIDR: 15000, TotalIDR: 30000}, {Code: "LABOR", Label: "Jasa tambahan", Type: "labor", Quantity: 1, UnitPriceIDR: 20000, TotalIDR: 20000}},
		IdempotencyKey:     "proposal-key-1",
		RequestFingerprint: "proposal-hash-1",
		CorrelationID:      "corr-1",
	}

	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta(`SELECT pg_advisory_xact_lock(hashtext($1))`)).
		WithArgs("service_adjustment:order-1").
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectQuery(`(?s)SELECT o.customer_id::text,.*FROM orders o.*FOR UPDATE OF o`).
		WithArgs("order-1", "courier-1").
		WillReturnRows(sqlmock.NewRows([]string{"customer_id", "service_category", "service_code", "service_sub_type", "quote_id", "pricing_snapshot", "status", "total_price_idr"}).
			AddRow("customer-1", "tambal_ban", "tambal_ban", "tambal_ban_motor", "quote-1", `{"source":"roadside_quote","total_price_idr":100000}`, "in_progress", int64(100000)))
	mock.ExpectQuery(`(?s)SELECT .*proposal_request_hash FROM service_adjustments WHERE requested_by_courier_id = \$1 AND proposal_idempotency_key = \$2`).
		WithArgs("courier-1", "proposal-key-1").
		WillReturnRows(sqlmock.NewRows(serviceAdjustmentTestColumns("proposal_request_hash")))
	mock.ExpectQuery(regexp.QuoteMeta(`SELECT id::text FROM service_adjustments WHERE order_id = $1 AND status = 'pending' LIMIT 1`)).
		WithArgs("order-1").
		WillReturnRows(sqlmock.NewRows([]string{"id"}))
	mock.ExpectQuery(`(?s)INSERT INTO service_adjustments.*initial_quote_id, initial_pricing_snapshot.*RETURNING`).
		WithArgs("order-1", "customer-1", "courier-1", "tambal_ban", "tambal_ban", "tambal_ban_motor", req.Reason, sqlmock.AnyArg(), "quote-1", `{"source":"roadside_quote","total_price_idr":100000}`, int64(100000), int64(50000), int64(150000), "proposal-key-1", "proposal-hash-1", "corr-1").
		WillReturnRows(sqlmock.NewRows(serviceAdjustmentTestColumns()).AddRow(serviceAdjustmentTestRow(domain.ServiceAdjustmentStatusPending, domain.ServiceAdjustmentFinancialNotDue, 0, nil, nil)...))
	mock.ExpectExec(`INSERT INTO audit_logs`).
		WithArgs("courier-1", "adj-1", sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectCommit()

	got, err := repo.Propose(ctx, req, "courier-1", 50000)
	if err != nil {
		t.Fatalf("Propose() error = %v", err)
	}
	if got.InitialQuoteID != "quote-1" {
		t.Fatalf("InitialQuoteID = %q, want quote-1", got.InitialQuoteID)
	}
	if string(got.InitialPricingSnapshot) != `{"source":"roadside_quote","total_price_idr":100000}` {
		t.Fatalf("InitialPricingSnapshot = %s", got.InitialPricingSnapshot)
	}
	if got.OriginalTotalIDR != 100000 || got.ProposedTotalIDR != 150000 {
		t.Fatalf("totals = %d -> %d, want 100000 -> 150000", got.OriginalTotalIDR, got.ProposedTotalIDR)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet SQL expectations: %v", err)
	}
}

func TestServiceAdjustmentApproveCommitsMoneyDecisionAndAuditTogether(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	defer db.Close()

	repo := NewServiceAdjustmentRepository(db)
	req := &domain.DecideServiceAdjustmentRequest{
		AdjustmentID:       "adj-1",
		Decision:           "approve",
		IdempotencyKey:     "decision-key-1",
		RequestFingerprint: "decision-hash-1",
		CorrelationID:      "corr-1",
	}
	approvedAt := time.Date(2026, 9, 6, 8, 1, 0, 0, time.UTC)

	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta(`SELECT pg_advisory_xact_lock(hashtext($1))`)).
		WithArgs("service_adjustment_decision:adj-1").
		WillReturnResult(sqlmock.NewResult(0, 1))
	expectServiceAdjustmentDecisionLoad(mock, domain.ServiceAdjustmentStatusPending, domain.ServiceAdjustmentFinancialNotDue, 0, nil, nil, 100000, "", "")
	mock.ExpectExec(`UPDATE orders SET total_price_idr = \$2`).
		WithArgs("order-1", int64(150000)).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectQuery(`(?s)UPDATE service_adjustments.*SET status = 'approved'.*RETURNING`).
		WithArgs("adj-1", "customer-1", "decision-key-1", "decision-hash-1", "corr-1").
		WillReturnRows(sqlmock.NewRows(serviceAdjustmentTestColumns()).AddRow(serviceAdjustmentTestRow(domain.ServiceAdjustmentStatusApproved, domain.ServiceAdjustmentFinancialPendingCollection, 50000, "customer-1", approvedAt)...))
	mock.ExpectExec(`INSERT INTO audit_logs`).
		WithArgs("customer-1", "service_adjustment.approved", "adj-1", sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectCommit()

	got, err := repo.Decide(context.Background(), req, "customer-1")
	if err != nil {
		t.Fatalf("Decide() error = %v", err)
	}
	if got.Status != domain.ServiceAdjustmentStatusApproved || got.FinancialState != domain.ServiceAdjustmentFinancialPendingCollection || got.ApprovedDeltaIDR != 50000 {
		t.Fatalf("approved state = status=%s financial=%s delta=%d", got.Status, got.FinancialState, got.ApprovedDeltaIDR)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet SQL expectations: %v", err)
	}
}

func TestServiceAdjustmentApproveRollsBackWhenAuditFails(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	defer db.Close()

	repo := NewServiceAdjustmentRepository(db)
	req := &domain.DecideServiceAdjustmentRequest{
		AdjustmentID:       "adj-1",
		Decision:           "approve",
		IdempotencyKey:     "decision-key-1",
		RequestFingerprint: "decision-hash-1",
		CorrelationID:      "corr-1",
	}
	approvedAt := time.Date(2026, 9, 6, 8, 1, 0, 0, time.UTC)

	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta(`SELECT pg_advisory_xact_lock(hashtext($1))`)).
		WithArgs("service_adjustment_decision:adj-1").
		WillReturnResult(sqlmock.NewResult(0, 1))
	expectServiceAdjustmentDecisionLoad(mock, domain.ServiceAdjustmentStatusPending, domain.ServiceAdjustmentFinancialNotDue, 0, nil, nil, 100000, "", "")
	mock.ExpectExec(`UPDATE orders SET total_price_idr = \$2`).
		WithArgs("order-1", int64(150000)).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectQuery(`(?s)UPDATE service_adjustments.*SET status = 'approved'.*RETURNING`).
		WithArgs("adj-1", "customer-1", "decision-key-1", "decision-hash-1", "corr-1").
		WillReturnRows(sqlmock.NewRows(serviceAdjustmentTestColumns()).AddRow(serviceAdjustmentTestRow(domain.ServiceAdjustmentStatusApproved, domain.ServiceAdjustmentFinancialPendingCollection, 50000, "customer-1", approvedAt)...))
	mock.ExpectExec(`INSERT INTO audit_logs`).
		WithArgs("customer-1", "service_adjustment.approved", "adj-1", sqlmock.AnyArg()).
		WillReturnError(errors.New("audit unavailable"))
	mock.ExpectRollback()

	_, err = repo.Decide(context.Background(), req, "customer-1")
	if err == nil {
		t.Fatal("Decide() error = nil, want audit failure")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet SQL expectations: %v", err)
	}
}

func TestServiceAdjustmentApproveReplayIsIdempotentWithoutDuplicateMoneyOrAudit(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}
	defer db.Close()

	repo := NewServiceAdjustmentRepository(db)
	req := &domain.DecideServiceAdjustmentRequest{
		AdjustmentID:       "adj-1",
		Decision:           "approve",
		IdempotencyKey:     "decision-key-1",
		RequestFingerprint: "decision-hash-1",
		CorrelationID:      "corr-1",
	}
	approvedAt := time.Date(2026, 9, 6, 8, 1, 0, 0, time.UTC)

	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta(`SELECT pg_advisory_xact_lock(hashtext($1))`)).
		WithArgs("service_adjustment_decision:adj-1").
		WillReturnResult(sqlmock.NewResult(0, 1))
	expectServiceAdjustmentDecisionLoad(mock, domain.ServiceAdjustmentStatusApproved, domain.ServiceAdjustmentFinancialPendingCollection, 50000, "customer-1", approvedAt, 150000, "decision-key-1", "decision-hash-1")
	// Idempotent replay returns the persisted decision immediately. No UPDATE orders,
	// no second audit row, and the read-only transaction is rolled back by defer.
	mock.ExpectRollback()

	got, err := repo.Decide(context.Background(), req, "customer-1")
	if err != nil {
		t.Fatalf("Decide() replay error = %v", err)
	}
	if got.Status != domain.ServiceAdjustmentStatusApproved || got.ApprovedDeltaIDR != 50000 {
		t.Fatalf("replay returned status=%s delta=%d", got.Status, got.ApprovedDeltaIDR)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet SQL expectations: %v", err)
	}
}
