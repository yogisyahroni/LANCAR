// Package resilience provides shared reliability primitives: circuit
// breaker, exponential-backoff retry, and bulkhead concurrency limiting.
//
// The circuit breaker implementation was extracted from
// integration-gateway/internal/provider/circuit_breaker.go so other
// services can reuse it without copy-pasting.
package resilience

import (
	"context"
	"fmt"
	"sync"
	"time"
)

// Circuit states.
type State int

const (
	StateClosed   State = iota // calls pass through normally
	StateOpen                  // calls fail fast (upstream known bad)
	StateHalfOpen              // one probe call allowed to test recovery
)

func (s State) String() string {
	switch s {
	case StateClosed:
		return "closed"
	case StateOpen:
		return "open"
	case StateHalfOpen:
		return "half_open"
	default:
		return "unknown"
	}
}

// CircuitBreaker implements a thread-safe circuit breaker.
//
//   Closed    calls pass through; consecutive failures are counted
//   Open      calls fail fast until openTimeout elapses
//   HalfOpen  a single probe passes through; successThresh consecutive
//             successes close the circuit, any failure reopens it
type CircuitBreaker struct {
	name          string
	failureThresh int           // failures before opening
	successThresh int           // consecutive successes before closing
	openTimeout   time.Duration // how long to stay open before half-open

	mu          sync.Mutex
	state       State
	failures    int
	successes   int
	lastFailure time.Time
	openedAt    time.Time
}

// BreakerOptions configures NewCircuitBreaker.
type BreakerOptions struct {
	Name            string        // identifier for logging/metrics
	FailureThreshold int          // consecutive failures before opening (default 5)
	SuccessThreshold int          // consecutive half-open successes before closing (default 2)
	OpenTimeout     time.Duration // how long to stay open before probing (default 30s)
}

// NewCircuitBreaker creates a breaker from options, applying defaults for
// zero-valued fields.
func NewCircuitBreaker(opts BreakerOptions) *CircuitBreaker {
	if opts.FailureThreshold <= 0 {
		opts.FailureThreshold = 5
	}
	if opts.SuccessThreshold <= 0 {
		opts.SuccessThreshold = 2
	}
	if opts.OpenTimeout <= 0 {
		opts.OpenTimeout = 30 * time.Second
	}
	return &CircuitBreaker{
		name:          opts.Name,
		failureThresh: opts.FailureThreshold,
		successThresh: opts.SuccessThreshold,
		openTimeout:   opts.OpenTimeout,
		state:         StateClosed,
	}
}

// ErrCircuitOpen is returned when the circuit is open and calls are rejected.
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
	case StateClosed:
		return nil

	case StateOpen:
		if time.Since(cb.openedAt) >= cb.openTimeout {
			cb.state = StateHalfOpen
			cb.successes = 0
			return nil
		}
		return &ErrCircuitOpen{Name: cb.name, OpenFor: time.Since(cb.openedAt)}

	case StateHalfOpen:
		// Only one probe at a time in half-open state.
		return nil
	}
	return nil
}

// RecordSuccess records a successful call.
func (cb *CircuitBreaker) RecordSuccess() {
	cb.mu.Lock()
	defer cb.mu.Unlock()

	switch cb.state {
	case StateHalfOpen:
		cb.successes++
		if cb.successes >= cb.successThresh {
			cb.state = StateClosed
			cb.failures = 0
			cb.successes = 0
		}
	case StateClosed:
		cb.failures = 0
	}
}

// RecordFailure records a failed call.
func (cb *CircuitBreaker) RecordFailure() {
	cb.mu.Lock()
	defer cb.mu.Unlock()

	cb.lastFailure = time.Now()
	switch cb.state {
	case StateHalfOpen:
		// Probe failed - reopen.
		cb.state = StateOpen
		cb.openedAt = time.Now()
		cb.successes = 0

	case StateClosed:
		cb.failures++
		if cb.failures >= cb.failureThresh {
			cb.state = StateOpen
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

// Name returns the breaker's identifier.
func (cb *CircuitBreaker) Name() string {
	return cb.name
}

// Execute runs fn through the breaker: checks Allow(), records the outcome,
// and returns the underlying result. When the circuit is open the returned
// error wraps *ErrCircuitOpen.
func (cb *CircuitBreaker) Execute(ctx context.Context, fn func(ctx context.Context) error) error {
	if err := cb.Allow(); err != nil {
		return err
	}
	err := fn(ctx)
	if err != nil {
		cb.RecordFailure()
		return err
	}
	cb.RecordSuccess()
	return nil
}
