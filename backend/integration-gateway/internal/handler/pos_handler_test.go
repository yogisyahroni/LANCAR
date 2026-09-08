package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"tembus/integration-gateway/internal/domain"
)

type posRegistryStub struct {
	registration domain.POSProviderRegistration
}

func (s posRegistryStub) Get(string) (domain.POSProviderRegistration, bool) {
	return s.registration, true
}
func (s posRegistryStub) List() []domain.POSProviderDescriptor      { return nil }
func (s posRegistryStub) Validate() error                           { return nil }
func (s posRegistryStub) Health(context.Context) []domain.POSHealth { return nil }

type posReceiverStub struct {
	receipt *domain.POSOrderReceipt
	err     error
	calls   int
}

func (s *posReceiverStub) ReceiveOrder(context.Context, domain.POSOrderRequest) (*domain.POSOrderReceipt, error) {
	s.calls++
	return s.receipt, s.err
}

type posRepoStub struct {
	delivery *domain.POSOrderDelivery
	finished string
}

func (s *posRepoStub) BeginOrderDelivery(_ context.Context, req domain.POSOrderRequest, providerCode, _ string) (*domain.POSOrderDelivery, bool, bool, error) {
	if s.delivery != nil {
		if s.delivery.IdempotencyKey != req.IdempotencyKey {
			return nil, false, false, domain.ErrPOSIdempotencyConflict
		}
		return s.delivery, true, false, nil
	}
	s.delivery = &domain.POSOrderDelivery{
		ID: "delivery-1", MerchantID: req.MerchantID, BranchID: req.BranchID, OrderID: req.OrderID,
		ProviderCode: providerCode, IdempotencyKey: req.IdempotencyKey, Status: "pending",
		CustomerOrderStatus: "pending_merchant", Attempts: 1,
	}
	return s.delivery, false, false, nil
}
func (s *posRepoStub) FinishOrderDelivery(_ context.Context, _, status, receiptID, lastError string) error {
	s.finished = status
	s.delivery.Status = status
	s.delivery.MerchantReceived = status == "acknowledged"
	s.delivery.ProviderReceiptID = receiptID
	s.delivery.LastError = lastError
	return nil
}
func (s *posRepoStub) BeginSyncOperation(context.Context, string, domain.POSCatalogSyncRequest, string, string) (*domain.POSSyncOperation, bool, bool, error) {
	return nil, false, false, errors.New("not used")
}
func (s *posRepoStub) FinishSyncOperation(context.Context, string, string, string, string) error {
	return errors.New("not used")
}
func (s *posRepoStub) RecordHealth(context.Context, domain.POSHealth) error { return nil }
func (s *posRepoStub) ListHealth(context.Context, string) ([]domain.POSHealth, error) {
	return nil, nil
}
func (s *posRepoStub) ListReconciliation(context.Context, string, int) ([]domain.POSReconciliationItem, error) {
	return nil, nil
}

func newPOSOrderRequest(t *testing.T, key string) *http.Request {
	t.Helper()
	payload, _ := json.Marshal(map[string]any{
		"provider":    "sandbox",
		"merchant_id": "8e7a2e6a-1e4a-4b31-8af7-202608080002",
		"branch_id":   "8e7a2e6a-1e4a-4b31-8af7-202608080003",
		"order_id":    "8e7a2e6a-1e4a-4b31-8af7-202608080004",
		"payload":     map[string]any{"order_number": "TMBS-1", "items": []string{"nasi"}},
	})
	req := httptest.NewRequest(http.MethodPost, "/api/internal/pos/orders", bytes.NewReader(payload))
	req.Header.Set("X-Idempotency-Key", key)
	return req
}

func TestReceiveOrderFailureNeverReportsCustomerAcceptance(t *testing.T) {
	receiver := &posReceiverStub{err: errors.New("provider timeout")}
	repo := &posRepoStub{}
	h := NewPOSHandler(posRegistryStub{registration: domain.POSProviderRegistration{
		Descriptor: domain.POSProviderDescriptor{Code: "sandbox", Name: "Sandbox"}, Order: receiver,
	}}, repo)
	recorder := httptest.NewRecorder()
	h.ReceiveOrder(recorder, newPOSOrderRequest(t, "pos-order-key-001"))
	if recorder.Code != http.StatusBadGateway {
		t.Fatalf("expected 502, got %d: %s", recorder.Code, recorder.Body.String())
	}
	var response map[string]any
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if response["success"] != false || response["merchant_received"] != false || response["customer_order_status"] != "pending_merchant" || response["customer_safe"] != true {
		t.Fatalf("unsafe POS failure response: %#v", response)
	}
	if repo.finished != "failed" || receiver.calls != 1 {
		t.Fatalf("expected durable failed delivery, calls=%d status=%s", receiver.calls, repo.finished)
	}
}

func TestReceiveOrderAckIsIdempotentAndDoesNotAcceptCustomerOrder(t *testing.T) {
	receiver := &posReceiverStub{receipt: &domain.POSOrderReceipt{Accepted: true, ProviderReceiptID: "receipt-1"}}
	repo := &posRepoStub{}
	h := NewPOSHandler(posRegistryStub{registration: domain.POSProviderRegistration{
		Descriptor: domain.POSProviderDescriptor{Code: "sandbox", Name: "Sandbox"}, Order: receiver,
	}}, repo)
	first := httptest.NewRecorder()
	h.ReceiveOrder(first, newPOSOrderRequest(t, "pos-order-key-002"))
	second := httptest.NewRecorder()
	h.ReceiveOrder(second, newPOSOrderRequest(t, "pos-order-key-002"))
	if first.Code != http.StatusOK || second.Code != http.StatusOK {
		t.Fatalf("expected successful receipt replay, codes=%d/%d", first.Code, second.Code)
	}
	if receiver.calls != 1 {
		t.Fatalf("idempotent replay called provider %d times", receiver.calls)
	}
	var response map[string]any
	_ = json.Unmarshal(second.Body.Bytes(), &response)
	if response["merchant_received"] != true || response["customer_order_status"] != "pending_merchant" {
		t.Fatalf("ack response changed customer acceptance semantics: %#v", response)
	}
}

func TestSyncRejectsExternalOwnershipMutation(t *testing.T) {
	repo := &posRepoStub{}
	h := NewPOSHandler(posRegistryStub{}, repo)
	payload, _ := json.Marshal(map[string]any{
		"provider":          "sandbox",
		"merchant_id":       "8e7a2e6a-1e4a-4b31-8af7-202608080002",
		"resource_id":       "menu-item-1",
		"canonical_version": 1,
		"idempotency_key":   "pos-catalog-key-001",
		"source":            "pos",
		"payload":           map[string]any{"name": "Nasi"},
	})
	recorder := httptest.NewRecorder()
	h.SyncCatalog(recorder, httptest.NewRequest(http.MethodPost, "/api/internal/pos/catalog", bytes.NewReader(payload)))
	if recorder.Code != http.StatusConflict {
		t.Fatalf("expected ownership conflict 409, got %d: %s", recorder.Code, recorder.Body.String())
	}
	var response map[string]any
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if response["code"] != "ERR_CANONICAL_OWNERSHIP_CONFLICT" {
		t.Fatalf("unexpected ownership response: %#v", response)
	}
}
