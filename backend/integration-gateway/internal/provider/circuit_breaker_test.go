package provider

import (
	"errors"
	"testing"
	"time"
)

func TestCircuitBreakerAllowsOnlyOneHalfOpenProbe(t *testing.T) {
	cb := NewCircuitBreaker("integration-test", 1, 2, 5*time.Millisecond)
	cb.RecordFailure()
	time.Sleep(10 * time.Millisecond)
	if err := cb.Allow(); err != nil {
		t.Fatalf("expected first recovery probe to pass, got %v", err)
	}
	var probeErr *ErrCircuitProbeInFlight
	if err := cb.Allow(); !errors.As(err, &probeErr) {
		t.Fatalf("expected second probe to fail fast, got %v", err)
	}
	cb.RecordSuccess()
	if err := cb.Allow(); err != nil {
		t.Fatalf("expected next probe after success to pass, got %v", err)
	}
}
