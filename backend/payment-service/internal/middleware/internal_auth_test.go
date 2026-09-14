package middleware

import (
	"bytes"
	"log"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestInternalAPIKeyFailureReasonNeverContainsCredential(t *testing.T) {
	configured := "configured-payment-secret"
	provided := "attacker-supplied-secret!"

	if got := InternalAPIKeyFailureReason("", provided); got != "missing_configured_key" {
		t.Fatalf("unexpected missing-config reason: %q", got)
	}
	if got := InternalAPIKeyFailureReason(configured, ""); got != "missing_provided_key" {
		t.Fatalf("unexpected missing-provided reason: %q", got)
	}
	if got := InternalAPIKeyFailureReason(configured, "short"); got != "length_mismatch" {
		t.Fatalf("unexpected length reason: %q", got)
	}
	got := InternalAPIKeyFailureReason(configured, provided)
	if got != "mismatch" {
		t.Fatalf("unexpected mismatch reason: %q", got)
	}
	if strings.Contains(got, configured) || strings.Contains(got, provided) {
		t.Fatalf("failure reason leaked a credential: %q", got)
	}
}

func TestRequireInternalAPIKeyEmitsRedactedStructuredFailure(t *testing.T) {
	var captured bytes.Buffer
	previousWriter := log.Writer()
	log.SetOutput(&captured)
	t.Cleanup(func() { log.SetOutput(previousWriter) })

	configured := "configured-payment-secret"
	provided := "attacker-supplied-secret!"
	req := httptest.NewRequest(http.MethodPost, "/api/internal/payment/refunds/events", nil)
	req.RemoteAddr = "10.0.0.9:4321"
	if RequireInternalAPIKey(req, configured, provided, "payment_refund_event.ingest") {
		t.Fatal("mismatched internal credential must be rejected")
	}

	output := captured.String()
	for _, secret := range []string{configured, provided} {
		if strings.Contains(output, secret) {
			t.Fatalf("internal auth log leaked credential %q: %s", secret, output)
		}
	}
	for _, marker := range []string{"internal_auth_failure", "payment_refund_event.ingest", "mismatch", "10.0.0.9:4321"} {
		if !strings.Contains(output, marker) {
			t.Fatalf("structured internal auth event missing %q: %s", marker, output)
		}
	}
}
