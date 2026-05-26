package middleware_test

import (
	"context"
	"testing"
	"time"

	"lancar/auth-service/internal/middleware"
)

func TestAuthAbuseProtector_LocksIdentifierAfterFailures(t *testing.T) {
	rdb := newTestRedis(t)
	flushTestKeys(t, rdb, "auth:*")
	defer flushTestKeys(t, rdb, "auth:*")

	t.Setenv("AUTH_BRUTE_FORCE_IDENTIFIER_FAILURE_LIMIT", "2")
	t.Setenv("AUTH_BRUTE_FORCE_IP_FAILURE_LIMIT", "10")
	t.Setenv("AUTH_BRUTE_FORCE_BASE_LOCKOUT_SECONDS", "60")
	t.Setenv("AUTH_BRUTE_FORCE_MAX_LOCKOUT_SECONDS", "120")

	protector := middleware.NewAuthAbuseProtector(rdb)
	ctx := context.Background()
	scope := middleware.ScopeCustomerPasswordLogin
	identifier := "customer@example.test"
	ipAddress := "10.44.55.66"

	if err := protector.AssertAllowed(ctx, scope, identifier, ipAddress); err != nil {
		t.Fatalf("expected first attempt to be allowed, got %v", err)
	}

	protector.RecordFailure(ctx, scope, identifier, ipAddress, "invalid_password")
	if err := protector.AssertAllowed(ctx, scope, identifier, ipAddress); err != nil {
		t.Fatalf("expected attempt before threshold to be allowed, got %v", err)
	}

	protector.RecordFailure(ctx, scope, identifier, ipAddress, "invalid_password")
	err := protector.AssertAllowed(ctx, scope, identifier, ipAddress)
	if err == nil {
		t.Fatal("expected identifier lockout after repeated failures")
	}
	if err.Code != "ERR_ACCOUNT_TEMPORARILY_LOCKED" {
		t.Fatalf("expected account lockout code, got %s", err.Code)
	}
	if err.RetryAfterSeconds <= 0 {
		t.Fatal("expected positive Retry-After value")
	}
}

func TestAuthAbuseProtector_RecordSuccessClearsIdentifierLockout(t *testing.T) {
	rdb := newTestRedis(t)
	flushTestKeys(t, rdb, "auth:*")
	defer flushTestKeys(t, rdb, "auth:*")

	t.Setenv("AUTH_BRUTE_FORCE_IDENTIFIER_FAILURE_LIMIT", "1")
	t.Setenv("AUTH_BRUTE_FORCE_IP_FAILURE_LIMIT", "10")
	t.Setenv("AUTH_BRUTE_FORCE_BASE_LOCKOUT_SECONDS", "60")

	protector := middleware.NewAuthAbuseProtector(rdb)
	ctx := context.Background()
	scope := middleware.ScopeCustomerOTPVerify
	identifier := "+6281234567890"
	ipAddress := "10.44.55.77"

	protector.RecordFailure(ctx, scope, identifier, ipAddress, "invalid_otp")
	if err := protector.AssertAllowed(ctx, scope, identifier, ipAddress); err == nil {
		t.Fatal("expected lockout before success cleanup")
	}

	protector.RecordSuccess(ctx, scope, identifier)
	if err := protector.AssertAllowed(ctx, scope, identifier, ipAddress); err != nil {
		t.Fatalf("expected lockout to be cleared after success, got %v", err)
	}
}

func TestAuthAbuseProtector_RateLimitsByIP(t *testing.T) {
	rdb := newTestRedis(t)
	flushTestKeys(t, rdb, "auth:*")
	defer flushTestKeys(t, rdb, "auth:*")

	t.Setenv("AUTH_BRUTE_FORCE_REQUEST_LIMIT", "1")
	t.Setenv("AUTH_BRUTE_FORCE_REQUEST_WINDOW_SECONDS", "60")

	protector := middleware.NewAuthAbuseProtector(rdb)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := protector.AssertAllowed(ctx, middleware.ScopeCustomerOTPSend, "+6281234567890", "10.44.55.88"); err != nil {
		t.Fatalf("expected first request to be allowed, got %v", err)
	}
	err := protector.AssertAllowed(ctx, middleware.ScopeCustomerOTPSend, "+6281234567890", "10.44.55.88")
	if err == nil {
		t.Fatal("expected second request to be rate limited")
	}
	if err.Code != "ERR_AUTH_RATE_LIMIT" {
		t.Fatalf("expected rate limit code, got %s", err.Code)
	}
}
