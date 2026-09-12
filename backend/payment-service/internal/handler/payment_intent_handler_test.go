package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"tembus/payment-service/internal/domain"
)

type paymentIntentRepoStub struct {
	created *domain.PaymentIntent
	event   *domain.PaymentIntentEvent
}

func (s *paymentIntentRepoStub) Create(_ context.Context, intent *domain.PaymentIntent) (*domain.PaymentIntent, error) {
	s.created = intent
	return intent, nil
}

func (s *paymentIntentRepoStub) GetByID(_ context.Context, id, customerID uuid.UUID) (*domain.PaymentIntent, error) {
	return &domain.PaymentIntent{ID: id, CustomerID: customerID}, nil
}

func (s *paymentIntentRepoStub) ApplyEvent(_ context.Context, event domain.PaymentIntentEvent) (*domain.PaymentIntent, error) {
	s.event = &event
	return &domain.PaymentIntent{ID: event.IntentID, State: event.NormalizedState}, nil
}

func TestCreatePaymentIntentRejectsClientPaidState(t *testing.T) {
	stub := &paymentIntentRepoStub{}
	handler := NewPaymentIntentHandler(stub)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/payment-intents", strings.NewReader(`{"order_id":"`+uuid.NewString()+`","market_code":"id-jk","currency":"IDR","amount_minor":1000,"payment_method":"qris","paid":true}`))
	req.Header.Set("X-User-ID", uuid.NewString())
	req.Header.Set("Idempotency-Key", "checkout-1")
	response := httptest.NewRecorder()

	handler.Create(response, req)

	if response.Code != http.StatusBadRequest || stub.created != nil {
		t.Fatalf("expected client paid flag to be rejected, got status=%d created=%v", response.Code, stub.created != nil)
	}
}

func TestCreatePaymentIntentHashesCanonicalRequest(t *testing.T) {
	stub := &paymentIntentRepoStub{}
	handler := NewPaymentIntentHandler(stub)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/payment-intents", strings.NewReader(`{"payment_method":"qris","amount_minor":1000,"currency":"idr","market_code":"ID-JK","order_id":"`+uuid.NewString()+`"}`))
	req.Header.Set("X-User-ID", uuid.NewString())
	req.Header.Set("Idempotency-Key", "checkout-2")
	response := httptest.NewRecorder()

	handler.Create(response, req)

	hash := ""
	if stub.created != nil {
		hash = stub.created.RequestHash
	}
	if response.Code != http.StatusOK || stub.created == nil || len(hash) != 64 {
		t.Fatalf("expected hashed request idempotency record, status=%d hash=%q", response.Code, hash)
	}
}

func TestApplyInternalEventFailsClosedWithoutServiceKey(t *testing.T) {
	t.Setenv("INTERNAL_PAYMENT_API_KEY", "staging-only-test-key")
	stub := &paymentIntentRepoStub{}
	handler := NewPaymentIntentHandler(stub)
	event := domain.PaymentIntentEvent{IntentID: uuid.New(), EventID: "evt-1", Source: "lookup", NormalizedState: domain.PaymentIntentProcessing, OccurredAt: time.Now().UTC()}
	body, _ := json.Marshal(event)
	req := httptest.NewRequest(http.MethodPost, "/api/internal/payment-intents/events", strings.NewReader(string(body)))
	response := httptest.NewRecorder()

	handler.ApplyInternalEvent(response, req)

	if response.Code != http.StatusUnauthorized || stub.event != nil {
		t.Fatalf("expected internal event to fail closed, status=%d event=%v", response.Code, stub.event != nil)
	}
}
