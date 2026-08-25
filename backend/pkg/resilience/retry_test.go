package resilience

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestWithRetryReturnsImmediatelyOnSuccess(t *testing.T) {
	cfg := RetryConfig{MaxAttempts: 3, BaseDelay: time.Millisecond, Multiplier: 2.0}
	calls := 0

	start := time.Now()
	err := WithRetry(context.Background(), cfg, func() (bool, error) {
		calls++
		return false, nil
	})
	elapsed := time.Since(start)

	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
	if calls != 1 {
		t.Fatalf("expected 1 call, got %d", calls)
	}
	if elapsed > 5*time.Millisecond {
		t.Fatalf("expected no backoff delay, took %s", elapsed)
	}
}

func TestWithRetryRetriesThenSucceeds(t *testing.T) {
	cfg := RetryConfig{MaxAttempts: 3, BaseDelay: time.Millisecond, Multiplier: 2.0}
	calls := 0

	err := WithRetry(context.Background(), cfg, func() (bool, error) {
		calls++
		if calls < 3 {
			return true, errors.New("transient")
		}
		return false, nil
	})

	if err != nil {
		t.Fatalf("expected eventual success, got %v", err)
	}
	if calls != 3 {
		t.Fatalf("expected 3 calls, got %d", calls)
	}
}

func TestWithRetryNonRetryableErrorNotRetried(t *testing.T) {
	cfg := RetryConfig{MaxAttempts: 5, BaseDelay: time.Millisecond, Multiplier: 2.0}
	sentinel := errors.New("bad request")
	calls := 0

	err := WithRetry(context.Background(), cfg, func() (bool, error) {
		calls++
		return false, sentinel
	})

	if !errors.Is(err, sentinel) {
		t.Fatalf("expected sentinel error, got %v", err)
	}
	if calls != 1 {
		t.Fatalf("expected single attempt for non-retryable error, got %d", calls)
	}
}

func TestWithRetryExhaustsAttempts(t *testing.T) {
	cfg := RetryConfig{MaxAttempts: 3, BaseDelay: time.Millisecond, Multiplier: 2.0}
	sentinel := errors.New("still failing")
	calls := 0

	err := WithRetry(context.Background(), cfg, func() (bool, error) {
		calls++
		return true, sentinel
	})

	if !errors.Is(err, sentinel) {
		t.Fatalf("expected last attempt's error, got %v", err)
	}
	if calls != 3 {
		t.Fatalf("expected exactly 3 attempts, got %d", calls)
	}
}

func TestWithRetryRespectsContextCancellation(t *testing.T) {
	cfg := RetryConfig{MaxAttempts: 5, BaseDelay: 50 * time.Millisecond, Multiplier: 2.0}
	ctx, cancel := context.WithCancel(context.Background())

	calls := 0
	done := make(chan error, 1)
	go func() {
		done <- WithRetry(ctx, cfg, func() (bool, error) {
			calls++
			cancel() // cancel during the backoff wait of attempt 1
			return true, errors.New("transient")
		})
	}()

	select {
	case err := <-done:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("expected context.Canceled, got %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("retry loop did not respect cancellation in time")
	}
	if calls != 1 {
		t.Fatalf("expected loop to stop after cancellation, made %d calls", calls)
	}
}

func TestWithRetryExponentialBackoffCapsAtMaxDelay(t *testing.T) {
	delays := []time.Duration{}
	cfg := RetryConfig{MaxAttempts: 4, BaseDelay: 10 * time.Millisecond, MaxDelay: 20 * time.Millisecond, Multiplier: 10.0}

	attemptStart := time.Now()
	err := WithRetry(context.Background(), cfg, func() (bool, error) {
		now := time.Now()
		if len(delays) > 0 || !attemptStart.IsZero() && len(delays) == 0 {
			delays = append(delays, now.Sub(attemptStart))
		}
		attemptStart = now
		return true, errors.New("transient")
	})
	if err == nil {
		t.Fatal("expected failure after exhausting attempts")
	}

	// Attempt delays should be capped: first ~10ms, then ~20ms (cap), not 100ms.
	for _, d := range delays[1:] {
		if d > 60*time.Millisecond {
			t.Fatalf("delay %s exceeds MaxDelay cap tolerance", d)
		}
	}
}

func TestDefaultRetryConfigSaneDefaults(t *testing.T) {
	cfg := DefaultRetryConfig()
	if cfg.MaxAttempts != 3 {
		t.Fatalf("expected 3 attempts, got %d", cfg.MaxAttempts)
	}
	if cfg.Multiplier != 2.0 {
		t.Fatalf("expected multiplier 2.0, got %f", cfg.Multiplier)
	}
	if cfg.BaseDelay <= 0 || cfg.MaxDelay <= cfg.BaseDelay {
		t.Fatalf("expected sane delays, got base=%s max=%s", cfg.BaseDelay, cfg.MaxDelay)
	}
}
