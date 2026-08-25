package resilience

import (
	"context"
	"errors"
)

// ErrBulkheadFull is returned by Acquire when the bulkhead (and its queue,
// if configured) has no capacity.
var ErrBulkheadFull = errors.New("bulkhead: no capacity available")

// Bulkhead limits the number of concurrent in-flight operations sharing one
// resource (upstream, connection pool, etc.), optionally queueing excess
// callers until capacity frees up or the context is canceled.
type Bulkhead struct {
	sem chan struct{}
}

// NewBulkhead creates a bulkhead allowing maxConcurrent concurrent
// executions and queueing up to maxQueued additional waiters.
func NewBulkhead(maxConcurrent, maxQueued int) *Bulkhead {
	if maxConcurrent <= 0 {
		maxConcurrent = 1
	}
	if maxQueued < 0 {
		maxQueued = 0
	}
	return &Bulkhead{sem: make(chan struct{}, maxConcurrent+maxQueued)}
}

// Acquire reserves a slot, blocking until one is free, the queue limit is
// reached, or ctx is done.
func (b *Bulkhead) Acquire(ctx context.Context) error {
	select {
	case b.sem <- struct{}{}:
		return nil
	default:
	}
	select {
	case b.sem <- struct{}{}:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

// TryAcquire reserves a slot without blocking; returns false if full.
func (b *Bulkhead) TryAcquire() bool {
	select {
	case b.sem <- struct{}{}:
		return true
	default:
		return false
	}
}

// Release frees a previously acquired slot. Safe to defer after Acquire.
func (b *Bulkhead) Release() {
	select {
	case <-b.sem:
	default:
	}
}

// InFlight reports the number of currently held slots (for metrics).
func (b *Bulkhead) InFlight() int {
	return len(b.sem)
}
