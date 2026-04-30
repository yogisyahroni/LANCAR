package middleware

import (
	"github.com/redis/go-redis/v9"
)

// assertRedis performs a type-safe assertion from the interface passed by main.go
// to the concrete *redis.Client required by rate_limiter.go.
func assertRedis(rdb interface{ Close() error }) *redis.Client {
	client, ok := rdb.(*redis.Client)
	if !ok {
		panic("middleware: assertRedis received non-*redis.Client — check main.go wiring")
	}
	return client
}
