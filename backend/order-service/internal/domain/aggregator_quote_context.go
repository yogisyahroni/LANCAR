package domain

import (
	"context"
	"fmt"
)

type aggregatorQuoteContextKey struct{}

func WithAggregatorQuoteID(ctx context.Context, quoteID string) context.Context {
	return context.WithValue(ctx, aggregatorQuoteContextKey{}, quoteID)
}

func AggregatorQuoteIDFromContext(ctx context.Context) string {
	value, _ := ctx.Value(aggregatorQuoteContextKey{}).(string)
	return value
}

type RequoteRequiredError struct {
	Reason string
}

func (e *RequoteRequiredError) Error() string {
	if e == nil || e.Reason == "" {
		return "carrier rate quote is no longer valid"
	}
	return fmt.Sprintf("carrier rate quote is no longer valid: %s", e.Reason)
}
