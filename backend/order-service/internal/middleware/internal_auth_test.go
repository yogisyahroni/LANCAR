package middleware

import (
	"strings"
	"testing"
)

func TestIsInternalAPIKeyValidFailsClosedAndComparesConstantTime(t *testing.T) {
	if IsInternalAPIKeyValid("", "") {
		t.Fatal("missing configured key must fail closed")
	}
	if IsInternalAPIKeyValid("service-key", "") || IsInternalAPIKeyValid("", "service-key") {
		t.Fatal("missing key on either side must fail closed")
	}
	if !IsInternalAPIKeyValid("service-key", " service-key ") {
		t.Fatal("matching trimmed key must be accepted")
	}
	if IsInternalAPIKeyValid("service-key", "service-key-x") {
		t.Fatal("different key must be rejected")
	}
}

func TestInternalAPIKeyFailureReasonNeverContainsCredential(t *testing.T) {
	configured := "configured-service-secret"
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
