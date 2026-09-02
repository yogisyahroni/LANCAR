package domain

import "context"

type aggregatorQuoteContextKey struct{}

func WithAggregatorQuoteID(ctx context.Context, quoteID string) context.Context {
	return context.WithValue(ctx, aggregatorQuoteContextKey{}, quoteID)
}

func AggregatorQuoteIDFromContext(ctx context.Context) string {
	value, _ := ctx.Value(aggregatorQuoteContextKey{}).(string)
	return value
}
