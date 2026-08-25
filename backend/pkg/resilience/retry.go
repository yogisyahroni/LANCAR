package resilience

import (
	"context"
	"fmt"
	"time"
)

// RetryConfig configures exponential backoff retry behavior.
type RetryConfig struct {
	MaxAttempts int           // maximum number of attempts (including first call)
	BaseDelay   time.Duration // initial delay
	MaxDelay    time.Duration // cap on delay
	Multiplier  float64       // backoff multiplier (e.g. 2.0 = double each time)
}

// DefaultRetryConfig returns sensible defaults for outbound HTTP calls:
// 3 attempts, 300ms initial delay, doubling up to a 3s cap.
func DefaultRetryConfig() RetryConfig {
	return RetryConfig{
		MaxAttempts: 3,
		BaseDelay:   300 * time.Millisecond,
		MaxDelay:    3 * time.Second,
		Multiplier:  2.0,
	}
}

// WithRetry executes fn with exponential backoff retry.
//
// fn returns (retryable, err): only errors with retryable == true are
// retried. ctx cancellation terminates the retry loop immediately and
// returns the context error. The final error (from the last attempt) is
// returned when all attempts fail.
func WithRetry(ctx context.Context, cfg RetryConfig, fn func() (retryable bool, err error)) error {
	if cfg.MaxAttempts < 1 {
		cfg.MaxAttempts = 1
	}
	delay := cfg.BaseDelay
	for attempt := 1; attempt <= cfg.MaxAttempts; attempt++ {
		retryable, err := fn()
		if err == nil {
			return nil
		}
		if !retryable || attempt == cfg.MaxAttempts {
			if ctx.Err() != nil {
				return ctx.Err()
			}
			return err
		}
		// Wait or respect context cancellation.
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(delay):
		}
		// Exponential backoff.
		delay = time.Duration(float64(delay) * cfg.Multiplier)
		if delay > cfg.MaxDelay {
			delay = cfg.MaxDelay
		}
	}
	return fmt.Errorf("all %d attempts failed", cfg.MaxAttempts)
}
