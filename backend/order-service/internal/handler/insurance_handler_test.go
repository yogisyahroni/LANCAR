package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"
	"tembus/order-service/internal/domain"
)

type fakeInsuranceService struct {
	domain.InsuranceService
	claim *domain.OrderInsuranceClaim
}

func (f *fakeInsuranceService) SubmitOrderInsuranceClaim(_ context.Context, orderID, claimantID uuid.UUID, reason string, claimedAmount int, evidence json.RawMessage) (*domain.OrderInsuranceClaim, error) {
	f.claim = &domain.OrderInsuranceClaim{
		ID:            uuid.New(),
		OrderID:       orderID,
		ClaimantID:    claimantID,
		Reason:        reason,
		ClaimedAmount: claimedAmount,
		EvidenceURLs:  evidence,
		Status:        domain.InsuranceClaimStatusSubmitted,
	}
	return f.claim, nil
}

func (f *fakeInsuranceService) GetOrderInsuranceClaim(context.Context, uuid.UUID, uuid.UUID) (*domain.OrderInsuranceClaim, error) {
	return f.claim, nil
}

func TestHandleOrderClaimCreatesClaimForAuthenticatedCustomer(t *testing.T) {
	svc := &fakeInsuranceService{}
	h := NewInsuranceHandler(svc)
	orderID, userID := uuid.New(), uuid.New()
	body := `{"reason":"Paket rusak","claimed_amount":250000,"evidence_urls":["https://cdn.example.test/proof.jpg"]}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/insurance/orders/"+orderID.String()+"/claim", strings.NewReader(body))
	req.Header.Set("X-User-ID", userID.String())
	res := httptest.NewRecorder()

	h.HandleOrderClaim(res, req)
	if res.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", res.Code, res.Body.String())
	}
	if svc.claim == nil || svc.claim.OrderID != orderID || svc.claim.ClaimantID != userID {
		t.Fatalf("claim was not bound to authenticated customer: %+v", svc.claim)
	}
}

func TestHandleOrderClaimRejectsInvalidEvidenceBeforeService(t *testing.T) {
	svc := &fakeInsuranceService{}
	h := NewInsuranceHandler(svc)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/insurance/orders/"+uuid.New().String()+"/claim", strings.NewReader(`{"reason":"Rusak","claimed_amount":1000,"evidence_urls":["file:///tmp/proof.jpg"]}`))
	req.Header.Set("X-User-ID", uuid.New().String())
	res := httptest.NewRecorder()

	h.HandleOrderClaim(res, req)
	if res.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", res.Code, res.Body.String())
	}
	if svc.claim != nil {
		t.Fatal("invalid evidence must not reach claim service")
	}
}
