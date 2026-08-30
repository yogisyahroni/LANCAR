package payment_gateway

import (
	"context"
	"crypto/sha512"
	"encoding/hex"
	"fmt"
	"strings"
	"testing"
	"time"

	"tembus/order-service/internal/domain"
	"tembus/order-service/internal/pkg/resilience"
)

func newTestGateway(serverKey string) *MidtransGateway {
	return NewMidtransGateway(MidtransConfig{
		ServerKey: serverKey,
		IsProd:    false,
	})
}

// TestGenerateQRISValidation verifies input validation before any HTTP call.
func TestGenerateQRISValidation(t *testing.T) {
	tests := []struct {
		name    string
		serverKey string
		amount  int
		wantErr string
	}{
		{"empty server key", "", 10000, "is not configured"},
		{"zero amount", "key", 0, "must be greater than zero"},
		{"negative amount", "key", -50, "must be greater than zero"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			g := newTestGateway(tt.serverKey)
			req := domain.PaymentGatewayRequest{PaymentNumber: "P1", OrderID: "O1", AmountIDR: tt.amount}
			_, err := g.GenerateQRIS(context.Background(), req)
			if err == nil {
				t.Fatalf("expected error containing %q, got nil", tt.wantErr)
			}
			if !strings.Contains(err.Error(), tt.wantErr) {
				t.Fatalf("expected error containing %q, got %v", tt.wantErr, err)
			}
		})
	}
}

// TestGenerateSnapValidation verifies input validation before any HTTP call.
func TestGenerateSnapValidation(t *testing.T) {
	g := newTestGateway("key")
	_, err := g.GenerateSnap(context.Background(), domain.SnapRequest{
		OrderID: "O1", AmountIDR: 0, ItemName: "Test", CustomerName: "Test User",
	})
	if err == nil || !strings.Contains(err.Error(), "must be greater than zero") {
		t.Fatalf("expected amount validation error, got %v", err)
	}

	emptyG := newTestGateway("")
	_, err = emptyG.GenerateSnap(context.Background(), domain.SnapRequest{
		OrderID: "O1", AmountIDR: 10000, ItemName: "Test", CustomerName: "Test User",
	})
	if err == nil || !strings.Contains(err.Error(), "not configured") {
		t.Fatalf("expected server key error, got %v", err)
	}
}

// TestVerifyWebhookSignature verifies the SHA512 signature formula:
// SHA512(order_id + status_code + gross_amount + server_key)
func TestVerifyWebhookSignature(t *testing.T) {
	serverKey := "my-secret-key"
	g := newTestGateway(serverKey)

	orderID := "ORDER-001"
	statusCode := "200"
	grossAmount := "100000"

	signString := orderID + statusCode + grossAmount + serverKey
	h := sha512.New()
	h.Write([]byte(signString))
	validSig := hex.EncodeToString(h.Sum(nil))

	payload := fmt.Sprintf(`{"order_id":"%s","status_code":"%s","gross_amount":"%s"}`, orderID, statusCode, grossAmount)

	tests := []struct {
		name   string
		sig    string
		wantOK bool
	}{
		{"valid signature", validSig, true},
		{"invalid signature", "garbage-signature", false},
		{"empty signature", "", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := g.VerifyWebhookSignature(context.Background(), []byte(payload), tt.sig)
			if tt.wantOK && err != nil {
				t.Fatalf("expected no error, got %v", err)
			}
			if !tt.wantOK && err == nil {
				t.Fatal("expected error, got nil")
			}
		})
	}
}

// TestVerifyWebhookSignatureNoKey ensures missing server key fails fast.
func TestVerifyWebhookSignatureNoKey(t *testing.T) {
	g := newTestGateway("")
	payload := `{"order_id":"O1","status_code":"200","gross_amount":"100000"}`
	err := g.VerifyWebhookSignature(context.Background(), []byte(payload), "whatever")
	if err == nil || !strings.Contains(err.Error(), "not configured") {
		t.Fatalf("expected not-configured error, got %v", err)
	}
}

// TestVerifyWebhookMalformedPayload ensures malformed payload fails.
func TestVerifyWebhookMalformedPayload(t *testing.T) {
	g := newTestGateway("key")
	err := g.VerifyWebhookSignature(context.Background(), []byte("not-json"), "sig")
	if err == nil || !strings.Contains(err.Error(), "failed to parse") {
		t.Fatalf("expected parse error, got %v", err)
	}
}

// TestCircuitBreakerConfigured verifies the shared circuit breaker is initialized.
func TestCircuitBreakerConfigured(t *testing.T) {
	if midtransBreaker == nil {
		t.Fatal("midtransBreaker should be initialized")
	}
	state := midtransBreaker.State()
	if state != "closed" {
		t.Logf("circuit breaker state: %s (expected closed)", state)
	}
}

// TestResilienceDefaults verifies the default retry config is sensible.
func TestResilienceDefaults(t *testing.T) {
	cfg := resilience.DefaultRetryConfig()
	if cfg.MaxAttempts < 1 || cfg.MaxAttempts > 10 {
		t.Errorf("unexpected MaxAttempts: %d", cfg.MaxAttempts)
	}
	if cfg.BaseDelay <= 0 || cfg.BaseDelay > 5*time.Second {
		t.Errorf("unexpected BaseDelay: %s", cfg.BaseDelay)
	}
}
