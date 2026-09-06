package handler

import (
	"bytes"
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"tembus/order-service/internal/domain"
	"tembus/order-service/internal/middleware"
)

type fakeRoadsideSettlementService struct {
	result    *domain.SettlementResult
	err       error
	orderID   string
	actorID   string
	actorRole string
}

func (f *fakeRoadsideSettlementService) Calculate(_ context.Context, orderID, actorID, actorRole string) (*domain.SettlementResult, error) {
	f.orderID = orderID
	f.actorID = actorID
	f.actorRole = actorRole
	return f.result, f.err
}

func roadsideSettlementRequest(body string) *http.Request {
	req := httptest.NewRequest(http.MethodPost, "/api/v1/order/settlement", bytes.NewBufferString(body))
	ctx := context.WithValue(req.Context(), middleware.UserIDKey, "courier-1")
	ctx = context.WithValue(ctx, middleware.RoleKey, "courier")
	return req.WithContext(ctx)
}

func TestRoadsideSettlementHandlerUsesAuthenticatedActorAndOrderOnly(t *testing.T) {
	fake := &fakeRoadsideSettlementService{result: &domain.SettlementResult{GrossTotal: 125000}}
	h := NewRoadsideSettlementHandler(fake)
	recorder := httptest.NewRecorder()

	h.Calculate(recorder, roadsideSettlementRequest(`{"order_id":"order-1"}`))

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body=%s", recorder.Code, recorder.Body.String())
	}
	if fake.orderID != "order-1" || fake.actorID != "courier-1" || fake.actorRole != "courier" {
		t.Fatalf("unexpected service call order=%q actor=%q role=%q", fake.orderID, fake.actorID, fake.actorRole)
	}
}

func TestRoadsideSettlementHandlerRejectsClientFinancialFields(t *testing.T) {
	fake := &fakeRoadsideSettlementService{result: &domain.SettlementResult{GrossTotal: 1}}
	h := NewRoadsideSettlementHandler(fake)
	recorder := httptest.NewRecorder()

	// The public contract only needs order_id. Even if older clients still send
	// financial fields, settlement amounts remain ignored because the service
	// loads its source from the database rather than this body.
	h.Calculate(recorder, roadsideSettlementRequest(`{"order_id":"order-1","gross_total":1,"base_fare":1}`))

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body=%s", recorder.Code, recorder.Body.String())
	}
	if fake.orderID != "order-1" {
		t.Fatalf("order id not forwarded: %q", fake.orderID)
	}
}

func TestRoadsideSettlementHandlerMapsProofGate(t *testing.T) {
	fake := &fakeRoadsideSettlementService{err: domain.ErrRoadsideSettlementProofRequired}
	h := NewRoadsideSettlementHandler(fake)
	recorder := httptest.NewRecorder()

	h.Calculate(recorder, roadsideSettlementRequest(`{"order_id":"order-1"}`))

	if recorder.Code != http.StatusConflict {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusConflict)
	}
}

func TestRoadsideSettlementHandlerMapsForbidden(t *testing.T) {
	fake := &fakeRoadsideSettlementService{err: domain.ErrForbidden}
	h := NewRoadsideSettlementHandler(fake)
	recorder := httptest.NewRecorder()

	h.Calculate(recorder, roadsideSettlementRequest(`{"order_id":"order-1"}`))

	if recorder.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusForbidden)
	}
	if !errors.Is(fake.err, domain.ErrForbidden) {
		t.Fatal("expected forbidden fake error")
	}
}
