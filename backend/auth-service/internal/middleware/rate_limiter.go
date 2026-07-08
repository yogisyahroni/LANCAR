package middleware

import (
	"context"
	"fmt"
	"net/http"
	"os"
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
//   - OTP send per-phone:          3 req / 300s (5 min)
//   - OTP verify per-session:      5 attempts / OTP TTL
//   - Auth endpoints per-IP:       20 req / 60s
// -------------------------------------------------------

// rateLimitPolicy defines a single rate-limiting rule.
type rateLimitPolicy struct {
	// maxRequests is the maximum number of requests allowed in window.
	maxRequests int
	// window is the time window for the limit.
	window time.Duration
	// keyPrefix is the Redis key prefix for this policy.
	keyPrefix string
}

// Built-in policies. Exported so main.go can reference them by name.
var (
	policyGlobalIP = rateLimitPolicy{
		maxRequests: 100,
		window:      60 * time.Second,
		keyPrefix:   "rl:global:ip",
	}

	policyOTPSend = rateLimitPolicy{
		maxRequests: 3,
		window:      5 * 60 * time.Second,
		keyPrefix:   "rl:otp:send",
	}

	policyOTPVerify = rateLimitPolicy{
		maxRequests: 5,
		window:      10 * 60 * time.Second, // 10 min — longer than OTP TTL
		keyPrefix:   "rl:otp:verify",
	}

	policyAuthIP = rateLimitPolicy{
		maxRequests: 20,
		window:      60 * time.Second,
		keyPrefix:   "rl:auth:ip",
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

// -------------------------------------------------------
// Core: sliding window increment via INCR + EXPIRE
// -------------------------------------------------------

// allow returns (allowed bool, current int, retryAfter time.Duration).
// Uses Redis INCR + EXPIRE for an approximate sliding window.
func (rl *RateLimiter) allow(ctx context.Context, key string) (bool, int, time.Duration) {
	fullKey := fmt.Sprintf("%s:%s", rl.policy.keyPrefix, key)

	pipe := rl.rdb.Pipeline()
	incrCmd := pipe.Incr(ctx, fullKey)
	pipe.Expire(ctx, fullKey, rl.policy.window)

	if _, err := pipe.Exec(ctx); err != nil {
		// Redis unavailable: fail-open (allow the request, log the error).
		// In production, consider fail-closed for critical endpoints.
		return true, 0, 0
	}

	current := int(incrCmd.Val())
	if current > rl.policy.maxRequests {
		// Calculate remaining TTL for Retry-After header.
		ttl, err := rl.rdb.TTL(ctx, fullKey).Result()
		if err != nil || ttl <= 0 {
			ttl = rl.policy.window
		}
		return false, current, ttl
	}

	return true, current, 0
}

// -------------------------------------------------------
// Middleware factories — one per policy
// -------------------------------------------------------

// LimitByIP applies the global per-IP rate limit.
// Use this as the outermost middleware on all public endpoints.
func LimitByIP(rdb *redis.Client) func(http.HandlerFunc) http.HandlerFunc {
	limiter := NewRateLimiter(rdb, policyGlobalIP)
	return func(next http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			ctx := r.Context()
			ip := realClientIP(r)
			allowed, current, retryAfter := limiter.allow(ctx, ip)

			// Always expose rate limit headers (RFC 6585)
			w.Header().Set("X-RateLimit-Limit", strconv.Itoa(policyGlobalIP.maxRequests))
			w.Header().Set("X-RateLimit-Remaining", strconv.Itoa(max(0, policyGlobalIP.maxRequests-current)))

			if !allowed {
				w.Header().Set("Retry-After", strconv.Itoa(int(retryAfter.Seconds())))
				correlationID := GetCorrelationID(ctx)
				WriteError(w, http.StatusTooManyRequests,
					"ERR_RATE_LIMIT",
					fmt.Sprintf("Too many requests. Retry after %d seconds.", int(retryAfter.Seconds())),
					correlationID,
					GetRequestID(ctx),
					GetTraceID(ctx),
				)
				return
			}

			next.ServeHTTP(w, r)
		}
	}
}

// LimitOTPSend applies the OTP send rate limit keyed by phone number.
// Expects the phone number to be extracted from the request body.
// Since the body is not parsed yet at middleware time, we key by IP here;
// the handler itself should do secondary validation by phone.
func LimitOTPSend(rdb *redis.Client) func(http.HandlerFunc) http.HandlerFunc {
	limiter := NewRateLimiter(rdb, policyOTPSend)
	return func(next http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			ctx := r.Context()
			// Key by IP + endpoint for OTP send (phone extracted in handler)
			ip := realClientIP(r)
			key := fmt.Sprintf("%s:%s", ip, r.URL.Path)
			allowed, _, retryAfter := limiter.allow(ctx, key)

			if !allowed {
				w.Header().Set("Retry-After", strconv.Itoa(int(retryAfter.Seconds())))
				correlationID := GetCorrelationID(ctx)
				WriteError(w, http.StatusTooManyRequests,
					"ERR_OTP_RATE_LIMIT",
					fmt.Sprintf("OTP requests are limited. Please wait %d seconds before requesting a new OTP.", int(retryAfter.Seconds())),
					correlationID,
					GetRequestID(ctx),
					GetTraceID(ctx),
				)
				return
			}

			next.ServeHTTP(w, r)
		}
	}
}

// LimitOTPVerify applies the OTP verification attempt rate limit.
// Key: IP address (coarse) — handler enforces per-OTP-session limit separately.
func LimitOTPVerify(rdb *redis.Client) func(http.HandlerFunc) http.HandlerFunc {
	limiter := NewRateLimiter(rdb, policyOTPVerify)
	return func(next http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			ctx := r.Context()
			ip := realClientIP(r)
			allowed, _, retryAfter := limiter.allow(ctx, ip)

			if !allowed {
				w.Header().Set("Retry-After", strconv.Itoa(int(retryAfter.Seconds())))
				correlationID := GetCorrelationID(ctx)
				WriteError(w, http.StatusTooManyRequests,
					"ERR_OTP_VERIFY_RATE_LIMIT",
					"Too many OTP verification attempts. Your IP has been temporarily blocked.",
					correlationID,
					GetRequestID(ctx),
					GetTraceID(ctx),
				)
				return
			}

			next.ServeHTTP(w, r)
		}
	}
}

// LimitAuthEndpoints applies stricter per-IP limit for all auth endpoints.
// Protects against credential stuffing and brute-force attacks.
func LimitAuthEndpoints(rdb *redis.Client) func(http.HandlerFunc) http.HandlerFunc {
	limiter := NewRateLimiter(rdb, policyAuthIP)
	return func(next http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			ctx := r.Context()
			ip := realClientIP(r)
			allowed, current, retryAfter := limiter.allow(ctx, ip)

			w.Header().Set("X-RateLimit-Limit", strconv.Itoa(policyAuthIP.maxRequests))
			w.Header().Set("X-RateLimit-Remaining", strconv.Itoa(max(0, policyAuthIP.maxRequests-current)))

			if !allowed {
				w.Header().Set("Retry-After", strconv.Itoa(int(retryAfter.Seconds())))
				correlationID := GetCorrelationID(ctx)
				WriteError(w, http.StatusTooManyRequests,
					"ERR_AUTH_RATE_LIMIT",
					fmt.Sprintf("Too many authentication attempts from your IP. Retry after %d seconds.", int(retryAfter.Seconds())),
					correlationID,
					GetRequestID(ctx),
					GetTraceID(ctx),
				)
				return
			}

			next.ServeHTTP(w, r)
		}
	}
}

// -------------------------------------------------------
// Phone-based OTP rate limiting (called from handler layer)
// -------------------------------------------------------

// CheckOTPPhoneLimit checks rate limit by phone number from the handler.
// Returns (allowed bool, retryAfterSeconds int).
// Call this AFTER parsing the phone number from the request body.
func CheckOTPPhoneLimit(ctx context.Context, rdb *redis.Client, phoneNumber string) (bool, int) {
	limiter := NewRateLimiter(rdb, policyOTPSend)
	// Sanitize phone for Redis key (remove non-alphanumeric)
	safePhone := sanitizePhoneKey(phoneNumber)
	allowed, _, retryAfter := limiter.allow(ctx, safePhone)
	return allowed, int(retryAfter.Seconds())
}

// -------------------------------------------------------
// Helpers
// -------------------------------------------------------

// realClientIP extracts the real client IP.
//
// LGN-02: X-Forwarded-For spoofing mitigation.
// XFF is ONLY trusted when the actual TCP connection (RemoteAddr) comes from
// a configured trusted proxy. Set TRUSTED_PROXY_IP to the IP of your Nginx /
// load balancer. Without this, attackers can inject arbitrary IPs via XFF to
// bypass per-IP rate limiting.
//
// Examples:
//
//	TRUSTED_PROXY_IP=10.0.0.1      → single proxy
//	TRUSTED_PROXY_IP=10.0.0.1,10.0.0.2 → multiple proxies
func realClientIP(r *http.Request) string {
	remoteAddr := r.RemoteAddr
	remoteHost := remoteAddr
	if idx := strings.LastIndex(remoteAddr, ":"); idx != -1 {
		remoteHost = remoteAddr[:idx]
	}

	// Only trust X-Forwarded-For if the connection is from a known proxy
	trustedProxies := os.Getenv("TRUSTED_PROXY_IP")
	if trustedProxies != "" {
		for _, proxy := range strings.Split(trustedProxies, ",") {
			if strings.TrimSpace(proxy) == remoteHost {
				// Connection is from our trusted proxy — XFF is reliable
				if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
					return strings.TrimSpace(strings.Split(xff, ",")[0])
				}
				if xri := r.Header.Get("X-Real-IP"); xri != "" {
					return strings.TrimSpace(xri)
				}
				break
			}
		}
		// Remote is NOT a trusted proxy — use direct connection IP (don't trust headers)
		return remoteHost
	}

	// No trusted proxy configured: fall back to direct TCP connection IP.
	// SECURITY 2026 — X-Forwarded-For Spoofing Risk:
	// Membaca XFF tanpa trusted proxy = siapapun bisa inject IP palsu.
	// Saat penyerang kirim: X-Forwarded-For: 1.2.3.4 → rate limiter melihat 1.2.3.4
	// bukan IP asli penyerang. Ini memungkinkan brute force melewati per-IP throttle.
	// Real breach: serangan login massal dengan rotasi XFF header (terjadi di fintech 2024).
	//
	// MITIGASI: Selalu set TRUSTED_PROXY_IP di environment production.
	// Jika tidak di-set, HANYA gunakan RemoteAddr (tidak baca XFF).
	if os.Getenv("TRUSTED_PROXY_IP") == "" {
		// Tidak ada trusted proxy — jangan percaya XFF
		// Log warning hanya sekali via sync.Once di startup (tidak di sini untuk avoid spam)
		return remoteHost
	}
	return remoteHost
}

// sanitizePhoneKey removes non-alphanumeric characters for safe Redis keys.
func sanitizePhoneKey(phone string) string {
	var sb strings.Builder
	for _, r := range phone {
		if (r >= '0' && r <= '9') || (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || r == '+' {
			sb.WriteRune(r)
		}
	}
	return sb.String()
}

// max returns the larger of two ints (Go 1.21+ has built-in max, but keep for compat).
func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
