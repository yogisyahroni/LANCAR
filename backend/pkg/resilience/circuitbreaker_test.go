package resilience

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"
)

func TestCircuitBreakerClosedByDefault(t *testing.T) {
	cb := NewCircuitBreaker(BreakerOptions{Name: "test"})
	if cb.State() != "closed" {
		t.Fatalf("expected closed, got %s", cb.State())
	}
	if err := cb.Allow(); err != nil {
		t.Fatalf("expected Allow to succeed on fresh breaker, got %v", err)
	}
}

func TestCircuitBreakerOpensAfterThreshold(t *testing.T) {
	cb := NewCircuitBreaker(BreakerOptions{Name: "test", FailureThreshold: 3})

	for i := 0; i < 3; i++ {
		if err := cb.Allow(); err != nil {
			t.Fatalf("attempt %d: expected Allow to succeed, got %v", i+1, err)
		}
		cb.RecordFailure()
	}

	if cb.State() != "open" {
		t.Fatalf("expected open after %d failures, got %s", 3, cb.State())
	}
	var openErr *ErrCircuitOpen
	if err := cb.Allow(); !errors.As(err, &openErr) {
		t.Fatalf("expected ErrCircuitOpen when open, got %v", err)
	}
}

func TestCircuitBreakerSuccessResetsFailureCount(t *testing.T) {
	cb := NewCircuitBreaker(BreakerOptions{Name: "test", FailureThreshold: 3})

	cb.RecordFailure()
	cb.RecordFailure()
	cb.RecordSuccess() // resets consecutive failures
	cb.RecordFailure()

	if cb.State() != "closed" {
		t.Fatalf("expected still closed after interleaved success, got %s", cb.State())
	}
}

func TestCircuitBreakerHalfOpenAfterTimeout(t *testing.T) {
	cb := NewCircuitBreaker(BreakerOptions{
		Name:             "test",
		FailureThreshold: 1,
		OpenTimeout:      10 * time.Millisecond,
	})

	cb.RecordFailure()
	if cb.State() != "open" {
		t.Fatalf("expected open, got %s", cb.State())
	}

	time.Sleep(15 * time.Millisecond)
	if err := cb.Allow(); err != nil {
		t.Fatalf("expected probe allowed after open timeout, got %v", err)
	}
	if cb.State() != "half_open" {
		t.Fatalf("expected half_open after timeout, got %s", cb.State())
	}
}

func TestCircuitBreakerClosesAfterConsecutiveProbeSuccesses(t *testing.T) {
	cb := NewCircuitBreaker(BreakerOptions{
		Name:             "test",
		FailureThreshold: 1,
		SuccessThreshold: 2,
		OpenTimeout:      10 * time.Millisecond,
	})

	cb.RecordFailure()
	time.Sleep(15 * time.Millisecond)
	_ = cb.Allow() // transition to half-open

	cb.RecordSuccess()
	if cb.State() != "half_open" {
		t.Fatalf("expected half_open after first probe success, got %s", cb.State())
	}
	cb.RecordSuccess()
	if cb.State() != "closed" {
		t.Fatalf("expected closed after second probe success, got %s", cb.State())
	}
}

func TestCircuitBreakerReopensOnProbeFailure(t *testing.T) {
	cb := NewCircuitBreaker(BreakerOptions{
		Name:             "test",
		FailureThreshold: 1,
		OpenTimeout:      10 * time.Millisecond,
	})

	cb.RecordFailure()
	time.Sleep(15 * time.Millisecond)
	_ = cb.Allow() // half-open

	cb.RecordFailure()
	if cb.State() != "open" {
		t.Fatalf("expected reopen after failed probe, got %s", cb.State())
	}
	if err := cb.Allow(); err == nil {
		t.Fatal("expected Allow to reject while reopened")
	}
}

func TestCircuitBreakerExecuteRecordsOutcome(t *testing.T) {
	cb := NewCircuitBreaker(BreakerOptions{Name: "test", FailureThreshold: 2})
	sentinel := errors.New("boom")

	if err := cb.Execute(context.Background(), func(ctx context.Context) error { return sentinel }); !errors.Is(err, sentinel) {
		t.Fatalf("expected fn error propagated, got %v", err)
	}
	if err := cb.Execute(context.Background(), func(ctx context.Context) error { return nil }); err != nil {
		t.Fatalf("expected success recorded, got %v", err)
	}
	if cb.State() != "closed" {
		t.Fatalf("expected closed, got %s", cb.State())
	}
}

func TestCircuitBreakerExecuteFailsFastWhenOpen(t *testing.T) {
	cb := NewCircuitBreaker(BreakerOptions{Name: "test", FailureThreshold: 1})
	cb.RecordFailure()

	called := false
	err := cb.Execute(context.Background(), func(ctx context.Context) error {
		called = true
		return nil
	})
	var openErr *ErrCircuitOpen
	if !errors.As(err, &openErr) {
		t.Fatalf("expected ErrCircuitOpen, got %v", err)
	}
	if called {
		t.Fatal("fn must not be called while circuit is open")
	}
}

func TestCircuitBreakerConcurrentUse(t *testing.T) {
	cb := NewCircuitBreaker(BreakerOptions{Name: "test", FailureThreshold: 1000})

	var wg sync.WaitGroup
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			_ = cb.Allow()
			if i%2 == 0 {
				cb.RecordFailure()
			} else {
				cb.RecordSuccess()
			}
			_ = cb.State()
		}(i)
	}
	wg.Wait()

	if cb.State() == "unknown" {
		t.Fatal("unexpected unknown state after concurrent use")
	}
}
