package provider

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"
)

var ErrCircuitOpen = errors.New("payment provider circuit is open")
var ErrProviderIdempotencyRequired = errors.New("provider mutation requires an idempotency key")

// ResilientAdapter is the common provider boundary. It gives every adapter a
// finite timeout, bounded retry, and circuit state without pretending that a
// retry is safe after an irreversible provider mutation.
type ResilientAdapter struct {
	next         Adapter
	timeout      time.Duration
	maxAttempts  int
	failureLimit int
	openFor      time.Duration
	mu           sync.Mutex
	failures     int
	openUntil    time.Time
}

func NewResilientAdapter(next Adapter, timeout time.Duration, maxAttempts, failureLimit int, openFor time.Duration) *ResilientAdapter {
	if maxAttempts < 1 {
		maxAttempts = 1
	}
	if failureLimit < 1 {
		failureLimit = 1
	}
	if timeout <= 0 {
		timeout = 10 * time.Second
	}
	if openFor <= 0 {
		openFor = 30 * time.Second
	}
	return &ResilientAdapter{next: next, timeout: timeout, maxAttempts: maxAttempts, failureLimit: failureLimit, openFor: openFor}
}

func (a *ResilientAdapter) Name() string                      { return a.next.Name() }
func (a *ResilientAdapter) Capabilities() map[Capability]bool { return a.next.Capabilities() }

func (a *ResilientAdapter) allowed() bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	return time.Now().After(a.openUntil)
}

func (a *ResilientAdapter) record(err error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if err == nil {
		a.failures = 0
		return
	}
	a.failures++
	if a.failures >= a.failureLimit {
		a.openUntil = time.Now().Add(a.openFor)
		a.failures = 0
	}
}

func (a *ResilientAdapter) call(ctx context.Context, operation string, fn func(context.Context) error) error {
	if a == nil || a.next == nil {
		return errors.New("payment provider adapter is nil")
	}
	if !a.allowed() {
		return ErrCircuitOpen
	}
	var last error
	for attempt := 0; attempt < a.maxAttempts; attempt++ {
		callCtx, cancel := context.WithTimeout(ctx, a.timeout)
		last = fn(callCtx)
		cancel()
		if last == nil {
			a.record(nil)
			return nil
		}
		if errors.Is(last, context.Canceled) || errors.Is(last, context.DeadlineExceeded) {
			// A caller cancellation is not a provider health signal, but a
			// deadline is: the next bounded attempt may still be useful.
			if errors.Is(ctx.Err(), context.Canceled) {
				break
			}
		}
	}
	a.record(last)
	return fmt.Errorf("payment provider %s failed after %d attempt(s): %w", operation, a.maxAttempts, last)
}

func (a *ResilientAdapter) Create(ctx context.Context, request PaymentRequest) (PaymentResponse, error) {
	if request.IdempotencyKey == "" {
		return PaymentResponse{}, ErrProviderIdempotencyRequired
	}
	var response PaymentResponse
	err := a.call(ctx, "create", func(callCtx context.Context) error {
		var err error
		response, err = a.next.Create(callCtx, request)
		return err
	})
	return response, err
}
func (a *ResilientAdapter) Lookup(ctx context.Context, reference string) (PaymentResponse, error) {
	var response PaymentResponse
	err := a.call(ctx, "lookup", func(callCtx context.Context) error {
		var err error
		response, err = a.next.Lookup(callCtx, reference)
		return err
	})
	return response, err
}
func (a *ResilientAdapter) Refund(ctx context.Context, request RefundRequest) (RefundResponse, error) {
	if request.IdempotencyKey == "" {
		return RefundResponse{}, ErrProviderIdempotencyRequired
	}
	var response RefundResponse
	err := a.call(ctx, "refund", func(callCtx context.Context) error {
		var err error
		response, err = a.next.Refund(callCtx, request)
		return err
	})
	return response, err
}
func (a *ResilientAdapter) VerifyWebhook(ctx context.Context, payload []byte, signature string) error {
	return a.call(ctx, "verify_webhook", func(callCtx context.Context) error { return a.next.VerifyWebhook(callCtx, payload, signature) })
}
