package provider

import "testing"

func TestJNEAvailabilityReportsCredentialsAndCircuitState(t *testing.T) {
	provider := &JNEProvider{cb: NewCircuitBreaker("jne_test", 1, 1, 0)}
	if available, reason := provider.Availability(); available || reason != "credentials_not_configured" {
		t.Fatalf("expected missing JNE credentials, got available=%v reason=%q", available, reason)
	}

	provider.apiKey = "key"
	provider.username = "user"
	provider.cb.RecordFailure()
	if available, reason := provider.Availability(); available || reason != "circuit_open" {
		t.Fatalf("expected open JNE circuit, got available=%v reason=%q", available, reason)
	}
}

func TestJNTAvailabilityReportsCredentialsAndCircuitState(t *testing.T) {
	provider := &JNTProvider{cb: NewCircuitBreaker("jnt_test", 1, 1, 0)}
	if available, reason := provider.Availability(); available || reason != "credentials_not_configured" {
		t.Fatalf("expected missing J&T credentials, got available=%v reason=%q", available, reason)
	}

	provider.apiAccount = "account"
	provider.privateKey = "key"
	provider.cb.RecordFailure()
	if available, reason := provider.Availability(); available || reason != "circuit_open" {
		t.Fatalf("expected open J&T circuit, got available=%v reason=%q", available, reason)
	}
}
