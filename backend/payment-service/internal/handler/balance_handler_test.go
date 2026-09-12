package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"

	"tembus/payment-service/internal/domain"
)

type fakeBalanceRepository struct {
	called bool
}

func (f *fakeBalanceRepository) EnsureAccount(context.Context, string, string, string, *uuid.UUID, domain.BalanceType) (uuid.UUID, error) {
	return uuid.Nil, nil
}

func (f *fakeBalanceRepository) Apply(context.Context, uuid.UUID, domain.BalanceOperation) (domain.BalanceSnapshot, bool, error) {
	f.called = true
	return domain.BalanceSnapshot{AvailableMinor: 700, HeldMinor: 300}, false, nil
}

func (f *fakeBalanceRepository) Snapshot(context.Context, uuid.UUID) (domain.BalanceSnapshot, error) {
	return domain.BalanceSnapshot{}, nil
}

func TestBalanceHandlerRequiresInternalCredential(t *testing.T) {
	t.Setenv("INTERNAL_PAYMENT_API_KEY", "only-server-secret")
	repo := &fakeBalanceRepository{}
	h := NewBalanceHandler(repo)
	req := httptest.NewRequest(http.MethodPost, "/api/internal/payment/balances/operations", nil)
	res := httptest.NewRecorder()
	h.Apply(res, req)
	if res.Code != http.StatusUnauthorized || repo.called {
		t.Fatalf("expected fail-closed unauthorized response, code=%d called=%v", res.Code, repo.called)
	}
}

func TestBalanceHandlerAppliesOperationWithInternalCredential(t *testing.T) {
	t.Setenv("INTERNAL_PAYMENT_API_KEY", "only-server-secret")
	repo := &fakeBalanceRepository{}
	h := NewBalanceHandler(repo)
	body := map[string]any{
		"account_id": uuid.New(), "entry_type": domain.BalanceHold, "amount_minor": 300,
		"source_type": "ORDER", "source_id": uuid.New(), "idempotency_key": "hold-1",
	}
	encoded, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, "/api/internal/payment/balances/operations", bytes.NewReader(encoded))
	req.Header.Set("X-Internal-API-Key", "only-server-secret")
	res := httptest.NewRecorder()
	h.Apply(res, req)
	if res.Code != http.StatusOK || !repo.called {
		t.Fatalf("expected operation to reach repository, code=%d called=%v body=%s", res.Code, repo.called, res.Body.String())
	}
}
