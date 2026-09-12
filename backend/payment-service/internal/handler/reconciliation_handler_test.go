package handler

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"tembus/payment-service/internal/domain"
	"tembus/payment-service/internal/service"
)

type reconciliationStoreStub struct{ calls int }

func (s *reconciliationStoreStub) RecordException(context.Context, *domain.ReconciliationRecord, *domain.ReconciliationRecord, *domain.ReconciliationRecord, domain.ReconciliationException) error {
	s.calls++
	return nil
}

func TestReconciliationHandlerFailsClosed(t *testing.T) {
	t.Setenv("INTERNAL_PAYMENT_API_KEY", "reconciliation-secret")
	h := NewReconciliationHandler(service.NewReconciliationService(&reconciliationStoreStub{}))
	req := httptest.NewRequest(http.MethodPost, "/api/internal/payment/reconciliation", bytes.NewBufferString(`{"internal":{}}`))
	res := httptest.NewRecorder()
	h.Reconcile(res, req)
	if res.Code != http.StatusUnauthorized {
		t.Fatalf("expected unauthorized, got %d", res.Code)
	}
}

func TestReconciliationHandlerReturnsDurableExceptionResult(t *testing.T) {
	t.Setenv("INTERNAL_PAYMENT_API_KEY", "reconciliation-secret")
	store := &reconciliationStoreStub{}
	h := NewReconciliationHandler(service.NewReconciliationService(store))
	req := httptest.NewRequest(http.MethodPost, "/api/internal/payment/reconciliation", bytes.NewBufferString(`{"internal":{"intent_id":"intent-1","provider":"provider-a","amount_minor":1000,"currency":"IDR","state":"PAID"},"provider":null}`))
	req.Header.Set("X-Internal-API-Key", "reconciliation-secret")
	res := httptest.NewRecorder()
	h.Reconcile(res, req)
	if res.Code != http.StatusOK || store.calls != 1 {
		t.Fatalf("expected one persisted exception, status=%d calls=%d body=%s", res.Code, store.calls, res.Body.String())
	}
}
