package middleware

import (
	"github.com/redis/go-redis/v9"
)

// assertRedis performs a type-safe assertion from the interface passed by main.go
// to the concrete *redis.Client required by rate_limiter.go.
//
// Design rationale:
//   - base_middleware.go and rate_limiter.go are in the same package.
//   - main.go creates a *redis.Client and passes it as interface{ Close() error }.
//   - This avoids importing redis directly in base_middleware.go (separation of concern).
//   - Panics at startup if called with a non-redis.Client value (fail-fast, not silent).
func assertRedis(rdb interface{ Close() error }) *redis.Client {
	client, ok := rdb.(*redis.Client)
	if !ok {
		panic("middleware: assertRedis received non-*redis.Client — check main.go wiring")
	}
	return client
}
