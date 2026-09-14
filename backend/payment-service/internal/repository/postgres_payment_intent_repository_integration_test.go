package repository_test

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	_ "github.com/lib/pq"

	"tembus/payment-service/internal/domain"
	"tembus/payment-service/internal/handler"
	"tembus/payment-service/internal/repository"
)

// This is intentionally opt-in. It exercises the real PostgreSQL schema that
// staging runs, but never treats a missing staging fixture/provider as a
// successful payment.
func TestPaymentIntentAndRefundIdempotencyAgainstStagingSchema(t *testing.T) {
	dsn := os.Getenv("TEMBUS_PAYMENT_SERVICE_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEMBUS_PAYMENT_SERVICE_TEST_DATABASE_URL is not configured")
	}
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	ctx := context.Background()
	if err := db.PingContext(ctx); err != nil {
		t.Fatal(err)
	}

	customerEmail := os.Getenv("TEMBUS_PAYMENT_SERVICE_TEST_CUSTOMER_EMAIL")
	if customerEmail == "" {
		customerEmail = "customer@tembus.id"
	}
	var customerID, orderID uuid.UUID
	if err := db.QueryRowContext(ctx, `SELECT id FROM users WHERE email=$1 LIMIT 1`, customerEmail).Scan(&customerID); err != nil {
		t.Skipf("staging customer fixture is unavailable: %v", err)
	}
	if err := db.QueryRowContext(ctx, `SELECT id FROM orders WHERE customer_id=$1 ORDER BY created_at DESC LIMIT 1`, customerID).Scan(&orderID); err != nil {
		t.Skipf("staging order fixture is unavailable: %v", err)
	}

	repo := repository.NewPostgresPaymentIntentRepository(db)
	createdAt := time.Now().UTC()
	firstKey := "staging-payment-create-" + uuid.NewString()
	intentID := uuid.New()
	intent := &domain.PaymentIntent{
		ID:                 intentID,
		OrderID:            orderID,
		CustomerID:         customerID,
		MarketCode:         "id-jk",
		Currency:           "IDR",
		AmountMinor:        1000,
		Provider:           "staging-disabled",
		PaymentMethod:      "qris",
		State:              domain.PaymentIntentCreated,
		RoutingRuleVersion: "staging-test-2026-09-14",
		IdempotencyKey:     firstKey,
		RequestHash:        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		ExpiresAt:          createdAt.Add(time.Hour),
		CreatedAt:          createdAt,
		UpdatedAt:          createdAt,
	}

	cleanupIntent := func(id uuid.UUID) {
		_, _ = db.Exec(`UPDATE payments SET payment_intent_id=NULL WHERE payment_intent_id=$1`, id)
		_, _ = db.Exec(`DELETE FROM payment_refund_ledger_entries WHERE intent_id=$1`, id)
		_, _ = db.Exec(`DELETE FROM payment_refund_events WHERE refund_id IN (SELECT id FROM payment_refunds WHERE intent_id=$1)`, id)
		_, _ = db.Exec(`DELETE FROM payment_refunds WHERE intent_id=$1`, id)
		_, _ = db.Exec(`DELETE FROM payment_intent_events WHERE intent_id=$1`, id)
		_, _ = db.Exec(`DELETE FROM payment_reconciliation_exceptions WHERE intent_id=$1`, id)
		_, _ = db.Exec(`DELETE FROM payment_intents WHERE id=$1`, id)
	}
	defer cleanupIntent(intentID)

	created, err := repo.Create(ctx, intent)
	if err != nil {
		t.Fatal(err)
	}
	replay := *intent
	replay.ID = uuid.New()
	replayed, err := repo.Create(ctx, &replay)
	if err != nil || replayed.ID != created.ID {
		t.Fatalf("same idempotency key must return original intent: created=%s replayed=%+v err=%v", created.ID, replayed, err)
	}
	conflict := *intent
	conflict.ID = uuid.New()
	conflict.RequestHash = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
	if _, err := repo.Create(ctx, &conflict); err == nil {
		t.Fatal("reusing an idempotency key with a different request must fail")
	}

	for _, event := range []domain.PaymentIntentEvent{
		{IntentID: intentID, EventID: "staging-payment-processing-" + uuid.NewString(), Source: "provider_webhook", ProviderRawStatus: "PENDING", NormalizedState: domain.PaymentIntentProcessing, OccurredAt: createdAt.Add(time.Second)},
		{IntentID: intentID, EventID: "staging-payment-paid-" + uuid.NewString(), Source: "provider_webhook", ProviderRawStatus: "PAID", NormalizedState: domain.PaymentIntentPaid, ProviderReference: "staging-payment-ref-" + uuid.NewString(), OccurredAt: createdAt.Add(2 * time.Second)},
	} {
		if _, err := repo.ApplyEvent(ctx, event); err != nil {
			t.Fatal(err)
		}
	}

	refundID := uuid.New()
	refundKey := "staging-payment-refund-" + uuid.NewString()
	if _, err := db.ExecContext(ctx, `INSERT INTO payment_refunds (id,intent_id,idempotency_key,amount_minor,currency,status) VALUES ($1,$2,$3,$4,$5,'REQUESTED')`, refundID, intentID, refundKey, 1000, "IDR"); err != nil {
		t.Fatal(err)
	}
	t.Setenv("INTERNAL_PAYMENT_API_KEY", "staging-payment-internal-test-key")
	refundHandler := handler.NewRefundEventHandler(db)
	refundEventID := "staging-refund-event-" + uuid.NewString()
	refundBody := func(eventID string) *httptest.ResponseRecorder {
		payload, _ := json.Marshal(map[string]any{
			"refund_id":           refundID,
			"event_id":            eventID,
			"provider_raw_status": "SUCCEEDED",
			"normalized_status":   "SUCCEEDED",
			"provider_reference":  "staging-refund-ref-" + refundID.String(),
			"payload":             map[string]any{"source": "staging-contract"},
			"occurred_at":         createdAt.Add(3 * time.Second),
		})
		req := httptest.NewRequest(http.MethodPost, "/api/internal/payment/refunds/events", bytesReader(payload))
		req.Header.Set("X-Internal-API-Key", "staging-payment-internal-test-key")
		response := httptest.NewRecorder()
		refundHandler.Ingest(response, req)
		return response
	}
	firstRefund := refundBody(refundEventID)
	if firstRefund.Code != http.StatusOK {
		t.Fatalf("first refund callback failed: status=%d body=%s", firstRefund.Code, firstRefund.Body.String())
	}
	secondRefund := refundBody(refundEventID)
	if secondRefund.Code != http.StatusOK {
		t.Fatalf("duplicate refund callback must be acknowledged: status=%d body=%s", secondRefund.Code, secondRefund.Body.String())
	}
	var ledgerEntries int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM payment_refund_ledger_entries WHERE refund_id=$1`, refundID).Scan(&ledgerEntries); err != nil {
		t.Fatal(err)
	}
	if ledgerEntries != 1 {
		t.Fatalf("duplicate refund callback must produce one ledger entry, got %d", ledgerEntries)
	}

	lateIntentID := uuid.New()
	lateKey := "staging-payment-late-" + uuid.NewString()
	lateIntent := *intent
	lateIntent.ID = lateIntentID
	lateIntent.IdempotencyKey = lateKey
	lateIntent.RequestHash = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
	defer cleanupIntent(lateIntentID)
	if _, err := repo.Create(ctx, &lateIntent); err != nil {
		t.Fatal(err)
	}
	if _, err := repo.ApplyEvent(ctx, domain.PaymentIntentEvent{IntentID: lateIntentID, EventID: "staging-late-expired", Source: "admin", ProviderRawStatus: "EXPIRED", NormalizedState: domain.PaymentIntentExpired, OccurredAt: createdAt.Add(time.Second)}); err != nil {
		t.Fatal(err)
	}
	if _, err := repo.ApplyEvent(ctx, domain.PaymentIntentEvent{IntentID: lateIntentID, EventID: "staging-late-paid", Source: "provider_webhook", ProviderRawStatus: "PAID", NormalizedState: domain.PaymentIntentPaid, ProviderReference: "late-provider-ref", OccurredAt: createdAt.Add(2 * time.Second)}); !errors.Is(err, domain.ErrPaymentIntentTerminal) {
		t.Fatalf("late success must remain an exception and not revive intent, got %v", err)
	}
	var lateExceptions int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM payment_reconciliation_exceptions WHERE intent_id=$1 AND exception_type='LATE_TERMINAL_CALLBACK'`, lateIntentID).Scan(&lateExceptions); err != nil {
		t.Fatal(err)
	}
	if lateExceptions != 1 {
		t.Fatalf("late callback must enter exception queue once, got %d", lateExceptions)
	}
}

func bytesReader(payload []byte) *bytes.Reader { return bytes.NewReader(payload) }
