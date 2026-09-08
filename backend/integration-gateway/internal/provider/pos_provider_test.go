package provider

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"tembus/integration-gateway/internal/domain"
)

func TestPOSRegistryFailsClosedWhenDeclaredCapabilityHasNoAdapter(t *testing.T) {
	registry := NewPOSProviderRegistry()
	registry.Register(domain.POSProviderRegistration{
		Descriptor: domain.POSProviderDescriptor{
			Code: "broken", Name: "Broken", Capabilities: []domain.POSCapability{domain.POSCapabilityOrderReceipt},
		},
	})
	if err := registry.Validate(); err == nil {
		t.Fatal("expected registry validation to reject missing order adapter")
	}
}

func TestHTTPPOSAdapterRequiresExplicitAcknowledgement(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/health" {
			w.WriteHeader(http.StatusOK)
			return
		}
		if r.Header.Get("X-Idempotency-Key") != "pos-test-key-001" {
			t.Errorf("missing idempotency header")
		}
		_, _ = w.Write([]byte(`{"accepted":false,"provider_status":"queued"}`))
	}))
	defer server.Close()
	adapter := NewHTTPPOSAdapter("sandbox", "Sandbox", server.URL, "test-api-key")
	receipt, err := adapter.ReceiveOrder(context.Background(), domain.POSOrderRequest{
		MerchantID: "merchant", OrderID: "order", IdempotencyKey: "pos-test-key-001", Payload: []byte(`{"order_id":"order"}`),
	})
	if err == nil || receipt != nil {
		t.Fatalf("expected missing acknowledgement to fail, receipt=%#v err=%v", receipt, err)
	}
	health := adapter.CheckHealth(context.Background())
	if health.State != "healthy" {
		t.Fatalf("expected health probe to pass, got %#v", health)
	}
}

func TestHTTPPOSAdapterAcceptsProviderReceipt(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/health" {
			w.WriteHeader(http.StatusOK)
			return
		}
		var payload map[string]any
		_ = json.NewDecoder(bytes.NewReader(mustReadAll(r))).Decode(&payload)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"accepted":true,"provider_receipt_id":"receipt-42"}`))
	}))
	defer server.Close()
	adapter := NewHTTPPOSAdapter("sandbox", "Sandbox", server.URL, "")
	receipt, err := adapter.ReceiveOrder(context.Background(), domain.POSOrderRequest{
		IdempotencyKey: "pos-test-key-002", Payload: []byte(`{"order_id":"order"}`),
	})
	if err != nil || receipt == nil || !receipt.Accepted || receipt.ProviderReceiptID != "receipt-42" {
		t.Fatalf("expected provider receipt, receipt=%#v err=%v", receipt, err)
	}
}

func mustReadAll(r *http.Request) []byte {
	var payload bytes.Buffer
	_, _ = payload.ReadFrom(r.Body)
	return payload.Bytes()
}
