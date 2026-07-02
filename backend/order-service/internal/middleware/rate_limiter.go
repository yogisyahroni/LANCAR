package middleware

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

// -------------------------------------------------------
// Redis-backed Rate Limiter
//
// Uses a sliding window counter per key stored in Redis.
// Keys automatically expire, so no cleanup needed.
//
// Policies enforced:
//   - Global per-IP:             100 req / 60s
//   - Order creation per-user:    10 req / 300s (5 min)
//   - Pricing estimate per-IP:    20 req / 60s
// -------------------------------------------------------

// rateLimitPolicy defines a single rate-limiting rule.
type rateLimitPolicy struct {
	maxRequests int
	window      time.Duration
	keyPrefix   string
}

// Built-in policies.
var (
	policyGlobalIP = rateLimitPolicy{
		maxRequests: 100,
		window:      60 * time.Second,
		keyPrefix:   "rl:global:ip",
	}

	policyOrderCreation = rateLimitPolicy{
		maxRequests: 10,
		window:      5 * 60 * time.Second,
		keyPrefix:   "rl:order:create",
	}

	policyPricingIP = rateLimitPolicy{
		maxRequests: 20,
		window:      60 * time.Second,
		keyPrefix:   "rl:pricing:ip",
	}
)

// RateLimiter holds the Redis client and default policy.
type RateLimiter struct {
	rdb    *redis.Client
	policy rateLimitPolicy
}

// NewRateLimiter creates a RateLimiter with the given Redis client and policy.
func NewRateLimiter(rdb *redis.Client, policy rateLimitPolicy) *RateLimiter {
	return &RateLimiter{rdb: rdb, policy: policy}
}

// allow returns (allowed bool, current int, retryAfter time.Duration).
func (rl *RateLimiter) allow(ctx context.Context, key string) (bool, int, time.Duration) {
	fullKey := fmt.Sprintf("%s:%s", rl.policy.keyPrefix, key)

	pipe := rl.rdb.Pipeline()
	incrCmd := pipe.Incr(ctx, fullKey)
	pipe.Expire(ctx, fullKey, rl.policy.window)

	if _, err := pipe.Exec(ctx); err != nil {
		// Redis unavailable: fail-open
		return true, 0, 0
	}

	current := int(incrCmd.Val())
	if current > rl.policy.maxRequests {
		ttl, err := rl.rdb.TTL(ctx, fullKey).Result()
		if err != nil || ttl <= 0 {
			ttl = rl.policy.window
		}
		return false, current, ttl
	}

	return true, current, 0
}

// LimitByIP applies the global per-IP rate limit.
func LimitByIP(rdb interface{ Close() error }) func(http.HandlerFunc) http.HandlerFunc {
	client := assertRedis(rdb)
	limiter := NewRateLimiter(client, policyGlobalIP)
	return func(next http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			ctx := r.Context()
			ip := realClientIP(r)
			allowed, current, retryAfter := limiter.allow(ctx, ip)

			w.Header().Set("X-RateLimit-Limit", strconv.Itoa(policyGlobalIP.maxRequests))
			w.Header().Set("X-RateLimit-Remaining", strconv.Itoa(max(0, policyGlobalIP.maxRequests-current)))

			if !allowed {
				w.Header().Set("Retry-After", strconv.Itoa(int(retryAfter.Seconds())))
				correlationID := GetCorrelationID(ctx)
				WriteError(w, http.StatusTooManyRequests,
					"ERR_RATE_LIMIT",
					fmt.Sprintf("Too many requests. Retry after %d seconds.", int(retryAfter.Seconds())),
					correlationID,
				)
				return
			}

			next.ServeHTTP(w, r)
		}
	}
}

// LimitOrderCreation applies rate limit for order creation keyed by user_id.
func LimitOrderCreation(rdb interface{ Close() error }) func(http.HandlerFunc) http.HandlerFunc {
	client := assertRedis(rdb)
	limiter := NewRateLimiter(client, policyOrderCreation)
	return func(next http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			ctx := r.Context()
			userID := GetUserIDFromContext(ctx)
			if userID == "" {
				// If not authenticated, use IP as fallback
				userID = realClientIP(r)
			}

			allowed, _, retryAfter := limiter.allow(ctx, userID)

			if !allowed {
				w.Header().Set("Retry-After", strconv.Itoa(int(retryAfter.Seconds())))
				correlationID := GetCorrelationID(ctx)
				WriteError(w, http.StatusTooManyRequests,
					"ERR_ORDER_RATE_LIMIT",
					fmt.Sprintf("Order creation is limited. Please wait %d seconds before creating a new order.", int(retryAfter.Seconds())),
					correlationID,
				)
				return
			}

			next.ServeHTTP(w, r)
		}
	}
}

// realClientIP extracts the real client IP.
func realClientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.Split(xff, ",")
		return strings.TrimSpace(parts[0])
	}
	if xri := r.Header.Get("X-Real-IP"); xri != "" {
		return strings.TrimSpace(xri)
	}
	addr := r.RemoteAddr
	if idx := strings.LastIndex(addr, ":"); idx != -1 {
		return addr[:idx]
	}
	return addr
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
