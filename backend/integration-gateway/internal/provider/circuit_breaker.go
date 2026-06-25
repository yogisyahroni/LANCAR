package provider

import (
	"context"
	"fmt"
	"sync"
	"time"
)

// ─────────────────────────────────────────────
// Simple Circuit Breaker for OTP Provider calls
// ─────────────────────────────────────────────
//
// States:
//   Closed   → calls pass through normally
//   Open     → calls fail fast (provider is known bad)
//   HalfOpen → one probe call is allowed to test recovery

type circuitState int

const (
	circuitClosed   circuitState = iota
	circuitOpen     circuitState = iota
	circuitHalfOpen circuitState = iota
)

func (s circuitState) String() string {
	switch s {
	case circuitClosed:
		return "closed"
	case circuitOpen:
		return "open"
	case circuitHalfOpen:
		return "half_open"
	default:
		return "unknown"
	}
}

// CircuitBreaker implements a thread-safe circuit breaker pattern.
type CircuitBreaker struct {
	name            string
	failureThresh   int           // failures before opening
	successThresh   int           // consecutive successes before closing
	openTimeout     time.Duration // how long to stay open before half-open

	mu              sync.Mutex
	state           circuitState
	failures        int
	successes       int
	lastFailure     time.Time
	openedAt        time.Time
}

// NewCircuitBreaker creates a new circuit breaker.
//
//   name            — identifier for logging
//   failureThresh   — number of consecutive failures before opening (e.g., 5)
//   successThresh   — consecutive successes in half-open before closing (e.g., 2)
//   openTimeout     — how long to stay open before allowing a probe (e.g., 30s)
func NewCircuitBreaker(name string, failureThresh, successThresh int, openTimeout time.Duration) *CircuitBreaker {
	return &CircuitBreaker{
		name:          name,
		failureThresh: failureThresh,
		successThresh: successThresh,
		openTimeout:   openTimeout,
		state:         circuitClosed,
	}
}

// ErrCircuitOpen is returned when the circuit is open and calls are being rejected.
type ErrCircuitOpen struct {
	Name    string
	OpenFor time.Duration
}

func (e *ErrCircuitOpen) Error() string {
	return fmt.Sprintf("circuit breaker %q is open (has been open for %s)", e.Name, e.OpenFor.Round(time.Second))
}

// Allow checks whether a call should proceed.
// Returns nil if allowed, *ErrCircuitOpen if the circuit is open.
func (cb *CircuitBreaker) Allow() error {
	cb.mu.Lock()
	defer cb.mu.Unlock()

	switch cb.state {
	case circuitClosed:
		return nil

	case circuitOpen:
		// Check if we should transition to half-open
		if time.Since(cb.openedAt) >= cb.openTimeout {
			cb.state = circuitHalfOpen
			cb.successes = 0
			return nil
		}
		return &ErrCircuitOpen{Name: cb.name, OpenFor: time.Since(cb.openedAt)}

	case circuitHalfOpen:
		// Only one probe at a time in half-open state
		return nil
	}
	return nil
}

// RecordSuccess records a successful call.
func (cb *CircuitBreaker) RecordSuccess() {
	cb.mu.Lock()
	defer cb.mu.Unlock()

	switch cb.state {
	case circuitHalfOpen:
		cb.successes++
		if cb.successes >= cb.successThresh {
			cb.state = circuitClosed
			cb.failures = 0
			cb.successes = 0
		}
	case circuitClosed:
		cb.failures = 0
	}
}

// RecordFailure records a failed call.
func (cb *CircuitBreaker) RecordFailure() {
	cb.mu.Lock()
	defer cb.mu.Unlock()

	cb.lastFailure = time.Now()
	switch cb.state {
	case circuitHalfOpen:
		// Probe failed — reopen
		cb.state = circuitOpen
		cb.openedAt = time.Now()
		cb.successes = 0

	case circuitClosed:
		cb.failures++
		if cb.failures >= cb.failureThresh {
			cb.state = circuitOpen
			cb.openedAt = time.Now()
		}
	}
}

// State returns the current circuit state (for metrics/logging).
func (cb *CircuitBreaker) State() string {
	cb.mu.Lock()
	defer cb.mu.Unlock()
	return cb.state.String()
}

// ─────────────────────────────────────────────
// Retry helper with exponential backoff
// ─────────────────────────────────────────────

// RetryConfig configures exponential backoff retry behavior.
type RetryConfig struct {
	MaxAttempts int           // maximum number of attempts (including first call)
	BaseDelay   time.Duration // initial delay
	MaxDelay    time.Duration // cap on delay
	Multiplier  float64       // backoff multiplier (e.g. 2.0 = double each time)
}

// DefaultRetryConfig returns sensible defaults for OTP provider calls.
func DefaultRetryConfig() RetryConfig {
	return RetryConfig{
		MaxAttempts: 3,
		BaseDelay:   300 * time.Millisecond,
		MaxDelay:    3 * time.Second,
		Multiplier:  2.0,
	}
}

// WithRetry executes fn with exponential backoff retry.
// Only retries if fn returns an error and retryable == true.
// ctx cancellation terminates the retry loop immediately.
func WithRetry(ctx context.Context, cfg RetryConfig, fn func() (retryable bool, err error)) error {
	delay := cfg.BaseDelay
	for attempt := 1; attempt <= cfg.MaxAttempts; attempt++ {
		retryable, err := fn()
		if err == nil {
			return nil
		}
		if !retryable || attempt == cfg.MaxAttempts {
			return err
		}
		// Wait or respect context cancellation
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(delay):
		}
		// Exponential backoff
		delay = time.Duration(float64(delay) * cfg.Multiplier)
		if delay > cfg.MaxDelay {
			delay = cfg.MaxDelay
		}
	}
	return fmt.Errorf("all %d attempts failed", cfg.MaxAttempts)
}
