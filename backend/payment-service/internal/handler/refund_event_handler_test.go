package handler

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestRefundTransitionDoesNotReopenTerminalOutcome(t *testing.T) {
	if !canTransitionRefund("REQUESTED", "SUCCEEDED") {
		t.Fatal("requested refund should be able to succeed")
	}
	if canTransitionRefund("SUCCEEDED", "PROCESSING") || canTransitionRefund("FAILED", "SUCCEEDED") {
		t.Fatal("terminal refund status must not regress or be rewritten")
	}
}

func TestRefundEventFailsClosedWithoutInternalKey(t *testing.T) {
	t.Setenv("INTERNAL_PAYMENT_API_KEY", "refund-test-key")
	h := NewRefundEventHandler(nil)
	req := httptest.NewRequest(http.MethodPost, "/api/internal/payment/refunds/events", strings.NewReader(`{}`))
	res := httptest.NewRecorder()
	h.Ingest(res, req)
	if res.Code != http.StatusUnauthorized {
		t.Fatalf("expected internal refund event auth failure, got %d", res.Code)
	}
}
