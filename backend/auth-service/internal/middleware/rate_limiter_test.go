package middleware_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/redis/go-redis/v9"

	"tembus/auth-service/internal/middleware"
)

// -------------------------------------------------------
// Integration helpers
// -------------------------------------------------------

// newTestRedis creates a real Redis client pointing at localhost.
// Tests using this are skipped if Redis is not reachable.
func newTestRedis(t *testing.T) *redis.Client {
	t.Helper()
	rdb := redis.NewClient(&redis.Options{
		Addr: "localhost:6379",
	})
	ctx := context.Background()
	if err := rdb.Ping(ctx).Err(); err != nil {
		t.Skipf("Skipping: Redis not reachable at localhost:6379 (%v)", err)
	}
	t.Cleanup(func() { rdb.Close() })
	return rdb
}

// flushTestKeys removes all rate-limit keys created during a test.
func flushTestKeys(t *testing.T, rdb *redis.Client, pattern string) {
	t.Helper()
	ctx := context.Background()
	keys, err := rdb.Keys(ctx, pattern).Result()
	if err != nil || len(keys) == 0 {
		return
	}
	rdb.Del(ctx, keys...)
}

// dummyHandler is a no-op handler that always returns 200 OK.
func dummyHandler(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
}

// -------------------------------------------------------
// LimitByIP tests
// -------------------------------------------------------

func TestLimitByIP_AllowsUnderLimit(t *testing.T) {
	rdb := newTestRedis(t)
	flushTestKeys(t, rdb, "rl:global:ip:*")
	defer flushTestKeys(t, rdb, "rl:global:ip:*")

	limiter := middleware.LimitByIP(rdb)
	handler := limiter(dummyHandler)

	// First request should pass
	req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/otp/send", nil)
	req.RemoteAddr = "10.0.0.1:1234"
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rr.Code)
	}
	if rr.Header().Get("X-RateLimit-Limit") == "" {
		t.Error("expected X-RateLimit-Limit header to be set")
	}
}

func TestLimitByIP_BlocksOverLimit(t *testing.T) {
	rdb := newTestRedis(t)
	// Use a unique IP per test to avoid interference
	testIP := "10.255.0.99"
	keyPattern := "rl:global:ip:" + testIP + "*"
	flushTestKeys(t, rdb, keyPattern)
	defer flushTestKeys(t, rdb, keyPattern)

	// Manually set counter to 100 (the limit)
	ctx := context.Background()
	key := "rl:global:ip:" + testIP
	rdb.Set(ctx, key, 100, 0)

	limiter := middleware.LimitByIP(rdb)
	handler := limiter(dummyHandler)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/any", nil)
	req.RemoteAddr = testIP + ":1234"
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusTooManyRequests {
		t.Errorf("expected 429, got %d", rr.Code)
	}
	if rr.Header().Get("Retry-After") == "" {
		t.Error("expected Retry-After header to be set when rate limited")
	}
}

// -------------------------------------------------------
// LimitOTPSend tests
// -------------------------------------------------------

func TestLimitOTPSend_AllowsThreeRequests(t *testing.T) {
	rdb := newTestRedis(t)
	flushTestKeys(t, rdb, "rl:otp:send:*")
	defer flushTestKeys(t, rdb, "rl:otp:send:*")

	limiter := middleware.LimitOTPSend(rdb)
	handler := limiter(dummyHandler)

	for i := 1; i <= 3; i++ {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/otp/send", nil)
		req.RemoteAddr = "10.1.1.1:5000"
		rr := httptest.NewRecorder()

		handler.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Errorf("request %d: expected 200, got %d", i, rr.Code)
		}
	}
}

func TestLimitOTPSend_BlocksFourthRequest(t *testing.T) {
	rdb := newTestRedis(t)
	testIP := "10.1.1.55"
	key := "rl:otp:send:" + testIP + ":/api/v1/auth/otp/send"
	flushTestKeys(t, rdb, key)
	defer flushTestKeys(t, rdb, key)

	// Set to the limit (3)
	ctx := context.Background()
	rdb.Set(ctx, key, 3, 0)

	limiter := middleware.LimitOTPSend(rdb)
	handler := limiter(dummyHandler)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/otp/send", nil)
	req.RemoteAddr = testIP + ":9999"
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusTooManyRequests {
		t.Errorf("expected 429, got %d", rr.Code)
	}
}

// -------------------------------------------------------
// LimitOTPVerify tests
// -------------------------------------------------------

func TestLimitOTPVerify_BlocksAfterFiveAttempts(t *testing.T) {
	rdb := newTestRedis(t)
	testIP := "10.2.2.77"
	key := "rl:otp:verify:" + testIP
	flushTestKeys(t, rdb, key)
	defer flushTestKeys(t, rdb, key)

	ctx := context.Background()
	rdb.Set(ctx, key, 5, 0)

	limiter := middleware.LimitOTPVerify(rdb)
	handler := limiter(dummyHandler)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/otp/verify", nil)
	req.RemoteAddr = testIP + ":1234"
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusTooManyRequests {
		t.Errorf("expected 429, got %d", rr.Code)
	}
}

// -------------------------------------------------------
// CheckOTPPhoneLimit tests
// -------------------------------------------------------

func TestCheckOTPPhoneLimit_AllowsNewPhone(t *testing.T) {
	rdb := newTestRedis(t)
	flushTestKeys(t, rdb, "rl:otp:send:*")
	defer flushTestKeys(t, rdb, "rl:otp:send:*")

	ctx := context.Background()
	allowed, _ := middleware.CheckOTPPhoneLimit(ctx, rdb, "+6281234567890")

	if !allowed {
		t.Error("expected new phone number to be allowed")
	}
}

func TestCheckOTPPhoneLimit_BlocksAfterLimit(t *testing.T) {
	rdb := newTestRedis(t)
	phone := "+6281999888777"
	// sanitizePhoneKey keeps '+', so the key uses the full phone with '+'
	safePhone := "+6281999888777"
	key := "rl:otp:send:" + safePhone
	flushTestKeys(t, rdb, key)
	defer flushTestKeys(t, rdb, key)

	ctx := context.Background()
	rdb.Set(ctx, key, 3, 0)

	allowed, retryAfter := middleware.CheckOTPPhoneLimit(ctx, rdb, phone)

	if allowed {
		t.Error("expected phone at limit to be blocked")
	}
	if retryAfter <= 0 {
		t.Error("expected retryAfter to be positive when blocked")
	}
}

// -------------------------------------------------------
// Response header tests
// -------------------------------------------------------

func TestRateLimitHeaders_Present(t *testing.T) {
	rdb := newTestRedis(t)
	flushTestKeys(t, rdb, "rl:auth:ip:*")
	defer flushTestKeys(t, rdb, "rl:auth:ip:*")

	limiter := middleware.LimitAuthEndpoints(rdb)
	handler := limiter(dummyHandler)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/refresh", nil)
	req.RemoteAddr = "10.3.3.3:8080"
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	if rr.Header().Get("X-RateLimit-Limit") == "" {
		t.Error("X-RateLimit-Limit header missing")
	}
	if rr.Header().Get("X-RateLimit-Remaining") == "" {
		t.Error("X-RateLimit-Remaining header missing")
	}
}
