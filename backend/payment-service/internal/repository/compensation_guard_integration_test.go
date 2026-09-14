package repository_test

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	_ "github.com/lib/pq"

	"tembus/payment-service/internal/handler"
)

// This test uses a disposable schema in the staging PostgreSQL instance. It
// exercises the real handler SQL and transaction boundaries without writing
// append-only test history into the shared application schema.
func TestCompensationGuardAgainstStagingPostgres(t *testing.T) {
	dsn := os.Getenv("TEMBUS_PAYMENT_SERVICE_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEMBUS_PAYMENT_SERVICE_TEST_DATABASE_URL is not configured")
	}
	baseDB, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer baseDB.Close()
	ctx := context.Background()
	if err := baseDB.PingContext(ctx); err != nil {
		t.Fatal(err)
	}

	schema := "payment_guard_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	if _, err := baseDB.ExecContext(ctx, `CREATE SCHEMA `+schema); err != nil {
		t.Fatal(err)
	}
	defer func() { _, _ = baseDB.ExecContext(ctx, `DROP SCHEMA `+schema+` CASCADE`) }()

	guardDB, err := sql.Open("postgres", dsn+` options='-c search_path=`+schema+`,public'`)
	if err != nil {
		t.Fatal(err)
	}
	defer guardDB.Close()
	guardDB.SetMaxOpenConns(1)
	if err := guardDB.PingContext(ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := guardDB.ExecContext(ctx, `SET search_path TO `+schema+`, public`); err != nil {
		t.Fatal(err)
	}
	for _, statement := range []string{
		`CREATE TABLE payment_intents (id UUID PRIMARY KEY, amount_minor BIGINT NOT NULL, provider VARCHAR(64))`,
		`CREATE TABLE payment_refund_ledger_entries (intent_id UUID NOT NULL, amount_minor BIGINT NOT NULL)`,
		`CREATE TABLE payment_chargeback_ledger_entries (intent_id UUID NOT NULL, entry_type VARCHAR(16) NOT NULL, amount_minor BIGINT NOT NULL)`,
		`CREATE TABLE payment_chargebacks (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), intent_id UUID NOT NULL, provider VARCHAR(64) NOT NULL, provider_case_reference VARCHAR(255) NOT NULL, amount_minor BIGINT NOT NULL, currency CHAR(3) NOT NULL, state VARCHAR(24) NOT NULL, evidence_deadline TIMESTAMPTZ, liability_owner VARCHAR(24) NOT NULL, provider_raw_payload JSONB NOT NULL, UNIQUE (provider, provider_case_reference))`,
		`CREATE TABLE payment_chargeback_events (chargeback_id UUID NOT NULL, event_id VARCHAR(255) NOT NULL, state VARCHAR(24) NOT NULL, provider_raw_status VARCHAR(128) NOT NULL, provider_raw_payload JSONB NOT NULL, occurred_at TIMESTAMPTZ NOT NULL, UNIQUE (chargeback_id, event_id))`,
		`CREATE TABLE payment_reconciliation_exceptions (intent_id UUID NOT NULL, provider VARCHAR(64) NOT NULL, provider_reference VARCHAR(255) NOT NULL, exception_type VARCHAR(64) NOT NULL, expected_amount_minor BIGINT, actual_amount_minor BIGINT, currency CHAR(3), metadata JSONB NOT NULL)`,
		`CREATE TABLE payment_refunds (id UUID PRIMARY KEY, intent_id UUID NOT NULL, status VARCHAR(24) NOT NULL, currency CHAR(3) NOT NULL, amount_minor BIGINT NOT NULL, provider_reference VARCHAR(255))`,
		`CREATE TABLE payment_refund_events (refund_id UUID NOT NULL, event_id VARCHAR(255) NOT NULL, provider_raw_status VARCHAR(128) NOT NULL, normalized_status VARCHAR(24) NOT NULL, provider_reference VARCHAR(255), payload JSONB NOT NULL, occurred_at TIMESTAMPTZ NOT NULL, UNIQUE (refund_id, event_id))`,
	} {
		if _, err := guardDB.ExecContext(ctx, statement); err != nil {
			t.Fatal(err)
		}
	}
	t.Setenv("INTERNAL_PAYMENT_API_KEY", "staging-compensation-guard-key")

	chargebackIntentID := uuid.New()
	if _, err := guardDB.ExecContext(ctx, `INSERT INTO payment_intents (id,amount_minor,provider) VALUES ($1,1000,'staging-disabled')`, chargebackIntentID); err != nil {
		t.Fatal(err)
	}
	if _, err := guardDB.ExecContext(ctx, `INSERT INTO payment_refund_ledger_entries (intent_id,amount_minor) VALUES ($1,600)`, chargebackIntentID); err != nil {
		t.Fatal(err)
	}
	chargebackPayload, _ := json.Marshal(map[string]any{
		"intent_id": chargebackIntentID, "provider": "staging-disabled", "case_reference": "guard-cb-" + uuid.NewString(),
		"event_id": "guard-cb-event-" + uuid.NewString(), "amount_minor": 500, "currency": "IDR", "state": "LOST",
		"provider_raw_status": "LOST", "liability_owner": "PLATFORM", "payload": map[string]string{"test": "compensation-guard"}, "occurred_at": time.Now().UTC(),
	})
	chargebackRequest := httptest.NewRequest(http.MethodPost, "/internal/payment/chargebacks/events", bytes.NewReader(chargebackPayload))
	chargebackRequest.Header.Set("X-Internal-API-Key", "staging-compensation-guard-key")
	chargebackResponse := httptest.NewRecorder()
	handler.NewChargebackHandler(guardDB).Ingest(chargebackResponse, chargebackRequest)
	if chargebackResponse.Code != http.StatusConflict {
		t.Fatalf("overlapping chargeback must be rejected, status=%d body=%s", chargebackResponse.Code, chargebackResponse.Body.String())
	}
	var chargebackExceptions, chargebackLedger int
	if err := guardDB.QueryRowContext(ctx, `SELECT COUNT(*) FROM payment_reconciliation_exceptions WHERE intent_id=$1 AND exception_type='CHARGEBACK_AFTER_REFUND'`, chargebackIntentID).Scan(&chargebackExceptions); err != nil {
		t.Fatal(err)
	}
	if err := guardDB.QueryRowContext(ctx, `SELECT COUNT(*) FROM payment_chargeback_ledger_entries WHERE intent_id=$1`, chargebackIntentID).Scan(&chargebackLedger); err != nil {
		t.Fatal(err)
	}
	if chargebackExceptions != 1 || chargebackLedger != 0 {
		t.Fatalf("chargeback guard evidence mismatch: exceptions=%d ledger=%d", chargebackExceptions, chargebackLedger)
	}

	refundIntentID := uuid.New()
	if _, err := guardDB.ExecContext(ctx, `INSERT INTO payment_intents (id,amount_minor,provider) VALUES ($1,1000,'staging-disabled')`, refundIntentID); err != nil {
		t.Fatal(err)
	}
	if _, err := guardDB.ExecContext(ctx, `INSERT INTO payment_chargeback_ledger_entries (intent_id,entry_type,amount_minor) VALUES ($1,'LOSS',600)`, refundIntentID); err != nil {
		t.Fatal(err)
	}
	refundID := uuid.New()
	if _, err := guardDB.ExecContext(ctx, `INSERT INTO payment_refunds (id,intent_id,status,currency,amount_minor) VALUES ($1,$2,'REQUESTED','IDR',500)`, refundID, refundIntentID); err != nil {
		t.Fatal(err)
	}
	refundPayload, _ := json.Marshal(map[string]any{
		"refund_id": refundID, "event_id": "guard-refund-event-" + uuid.NewString(), "provider_raw_status": "SUCCEEDED",
		"normalized_status": "SUCCEEDED", "provider_reference": "guard-refund-ref-" + uuid.NewString(), "payload": map[string]string{"test": "compensation-guard"}, "occurred_at": time.Now().UTC(),
	})
	refundRequest := httptest.NewRequest(http.MethodPost, "/internal/payment/refunds/events", bytes.NewReader(refundPayload))
	refundRequest.Header.Set("X-Internal-API-Key", "staging-compensation-guard-key")
	refundResponse := httptest.NewRecorder()
	handler.NewRefundEventHandler(guardDB).Ingest(refundResponse, refundRequest)
	if refundResponse.Code != http.StatusConflict {
		t.Fatalf("overlapping refund must be rejected, status=%d body=%s", refundResponse.Code, refundResponse.Body.String())
	}
	var refundExceptions, refundLedger int
	if err := guardDB.QueryRowContext(ctx, `SELECT COUNT(*) FROM payment_reconciliation_exceptions WHERE intent_id=$1 AND exception_type='REFUND_AFTER_CHARGEBACK'`, refundIntentID).Scan(&refundExceptions); err != nil {
		t.Fatal(err)
	}
	if err := guardDB.QueryRowContext(ctx, `SELECT COUNT(*) FROM payment_refund_ledger_entries WHERE intent_id=$1`, refundIntentID).Scan(&refundLedger); err != nil {
		t.Fatal(err)
	}
	if refundExceptions != 1 || refundLedger != 0 {
		t.Fatalf("refund guard evidence mismatch: exceptions=%d ledger=%d", refundExceptions, refundLedger)
	}
}
