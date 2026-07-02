package middleware

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

type AuthAbuseScope string

const (
	ScopeCustomerPasswordLogin AuthAbuseScope = "customer_password_login"
	ScopeCustomerRegistration  AuthAbuseScope = "customer_registration"
	ScopeCustomerOTPSend       AuthAbuseScope = "customer_otp_send"
	ScopeCustomerOTPVerify     AuthAbuseScope = "customer_otp_verify"
	ScopeCustomer2FAComplete   AuthAbuseScope = "customer_2fa_complete"
	ScopePasswordReset         AuthAbuseScope = "password_reset"
	// S3-SEC-01: Multi-account fraud detection scopes
	ScopeMultiAccount AuthAbuseScope = "multi_account_device"
	ScopePromoAbuse   AuthAbuseScope = "promo_abuse"
)

type AuthAbusePolicy struct {
	RequestLimit           int
	RequestWindow          time.Duration
	IdentifierFailureLimit int
	IPFailureLimit         int
	BaseLockout            time.Duration
	MaxLockout             time.Duration
}

type AuthAbuseProtector struct {
	rdb        *redis.Client
	production bool
	policy     AuthAbusePolicy
}

type AuthAbuseError struct {
	StatusCode        int
	Code              string
	Message           string
	RetryAfterSeconds int
}

func (e *AuthAbuseError) Error() string {
	return e.Message
}

func NewAuthAbuseProtector(rdb *redis.Client) *AuthAbuseProtector {
	production := strings.EqualFold(os.Getenv("ENVIRONMENT"), "production") ||
		strings.EqualFold(os.Getenv("NODE_ENV"), "production")

	return &AuthAbuseProtector{
		rdb:        rdb,
		production: production,
		policy: AuthAbusePolicy{
			RequestLimit:           envInt("AUTH_BRUTE_FORCE_REQUEST_LIMIT", chooseInt(production, 30, 300)),
			RequestWindow:          time.Duration(envInt("AUTH_BRUTE_FORCE_REQUEST_WINDOW_SECONDS", 60)) * time.Second,
			IdentifierFailureLimit: envInt("AUTH_BRUTE_FORCE_IDENTIFIER_FAILURE_LIMIT", chooseInt(production, 5, 20)),
			IPFailureLimit:         envInt("AUTH_BRUTE_FORCE_IP_FAILURE_LIMIT", chooseInt(production, 30, 100)),
			BaseLockout:            time.Duration(envInt("AUTH_BRUTE_FORCE_BASE_LOCKOUT_SECONDS", chooseInt(production, 15*60, 60))) * time.Second,
			MaxLockout:             time.Duration(envInt("AUTH_BRUTE_FORCE_MAX_LOCKOUT_SECONDS", chooseInt(production, 60*60, 5*60))) * time.Second,
		},
	}
}

func envInt(name string, fallback int) int {
	raw := strings.TrimSpace(os.Getenv(name))
	if raw == "" {
		return fallback
	}
	var value int
	if _, err := fmt.Sscanf(raw, "%d", &value); err != nil || value <= 0 {
		return fallback
	}
	return value
}

func chooseInt(condition bool, whenTrue int, whenFalse int) int {
	if condition {
		return whenTrue
	}
	return whenFalse
}

func ClientIP(r *http.Request) string {
	return realClientIP(r)
}

func normalizeAuthIdentifier(identifier string) string {
	normalized := strings.TrimSpace(strings.ToLower(identifier))
	if normalized == "" {
		return "anonymous"
	}
	return normalized
}

func hashAuthDimension(value string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(strings.ToLower(value))))
	return hex.EncodeToString(sum[:])
}

func authAbuseLockoutKey(scope AuthAbuseScope, dimension string, value string) string {
	return fmt.Sprintf("auth:lockout:%s:%s:%s", scope, dimension, hashAuthDimension(value))
}

func authAbuseFailureKey(scope AuthAbuseScope, dimension string, value string) string {
	return fmt.Sprintf("auth:fail:%s:%s:%s", scope, dimension, hashAuthDimension(value))
}

func authAbuseRequestKey(scope AuthAbuseScope, ipAddress string) string {
	return fmt.Sprintf("auth:req:%s:ip:%s", scope, hashAuthDimension(ipAddress))
}

func (p *AuthAbuseProtector) unavailableError() *AuthAbuseError {
	return &AuthAbuseError{
		StatusCode:        http.StatusServiceUnavailable,
		Code:              "ERR_AUTH_PROTECTION_UNAVAILABLE",
		Message:           "Authentication protection is temporarily unavailable",
		RetryAfterSeconds: 30,
	}
}

func (p *AuthAbuseProtector) degradedAllow(err error) bool {
	if err == nil {
		return false
	}
	if p.production {
		return false
	}
	log.Printf(`{"level":"warn","event":"auth_protection_degraded","reason":"%s"}`, RedactString(err.Error()))
	return true
}

func (p *AuthAbuseProtector) incrementWithExpiry(ctx context.Context, key string, expiry time.Duration) (int, error) {
	pipe := p.rdb.Pipeline()
	incr := pipe.Incr(ctx, key)
	pipe.Expire(ctx, key, expiry)
	if _, err := pipe.Exec(ctx); err != nil {
		return 0, err
	}
	return int(incr.Val()), nil
}

func (p *AuthAbuseProtector) retryAfter(ctx context.Context, key string, fallback time.Duration) int {
	ttl, err := p.rdb.TTL(ctx, key).Result()
	if err != nil || ttl <= 0 {
		ttl = fallback
	}
	return int(ttl.Seconds())
}

func (p *AuthAbuseProtector) AssertAllowed(ctx context.Context, scope AuthAbuseScope, identifier string, ipAddress string) *AuthAbuseError {
	if p == nil || p.rdb == nil {
		return nil
	}

	identifier = normalizeAuthIdentifier(identifier)
	if strings.TrimSpace(ipAddress) == "" {
		ipAddress = "unknown"
	}

	identifierLockKey := authAbuseLockoutKey(scope, "identifier", identifier)
	ipLockKey := authAbuseLockoutKey(scope, "ip", ipAddress)

	identifierLocked, err := p.rdb.Exists(ctx, identifierLockKey).Result()
	if p.degradedAllow(err) {
		return nil
	}
	if err != nil {
		return p.unavailableError()
	}
	if identifierLocked == 1 {
		return &AuthAbuseError{
			StatusCode:        http.StatusLocked,
			Code:              "ERR_ACCOUNT_TEMPORARILY_LOCKED",
			Message:           "Too many failed attempts. Try again later.",
			RetryAfterSeconds: p.retryAfter(ctx, identifierLockKey, p.policy.BaseLockout),
		}
	}

	ipLocked, err := p.rdb.Exists(ctx, ipLockKey).Result()
	if p.degradedAllow(err) {
		return nil
	}
	if err != nil {
		return p.unavailableError()
	}
	if ipLocked == 1 {
		return &AuthAbuseError{
			StatusCode:        http.StatusTooManyRequests,
			Code:              "ERR_AUTH_NETWORK_TEMPORARILY_LOCKED",
			Message:           "Too many failed attempts from this network. Try again later.",
			RetryAfterSeconds: p.retryAfter(ctx, ipLockKey, p.policy.BaseLockout),
		}
	}

	requestCount, err := p.incrementWithExpiry(ctx, authAbuseRequestKey(scope, ipAddress), p.policy.RequestWindow)
	if p.degradedAllow(err) {
		return nil
	}
	if err != nil {
		return p.unavailableError()
	}
	if requestCount > p.policy.RequestLimit {
		return &AuthAbuseError{
			StatusCode:        http.StatusTooManyRequests,
			Code:              "ERR_AUTH_RATE_LIMIT",
			Message:           "Too many authentication attempts. Slow down and try again later.",
			RetryAfterSeconds: int(p.policy.RequestWindow.Seconds()),
		}
	}

	return nil
}

func (p *AuthAbuseProtector) RecordFailure(ctx context.Context, scope AuthAbuseScope, identifier string, ipAddress string, reason string) {
	if p == nil || p.rdb == nil {
		return
	}

	identifier = normalizeAuthIdentifier(identifier)
	if strings.TrimSpace(ipAddress) == "" {
		ipAddress = "unknown"
	}

	identifierFailureKey := authAbuseFailureKey(scope, "identifier", identifier)
	ipFailureKey := authAbuseFailureKey(scope, "ip", ipAddress)

	identifierFailures, err := p.incrementWithExpiry(ctx, identifierFailureKey, p.policy.MaxLockout)
	if p.degradedAllow(err) {
		return
	}
	if err != nil {
		log.Printf(`{"level":"error","event":"auth_failure_record_error","scope":"%s","reason":"%s"}`, scope, RedactString(err.Error()))
		return
	}

	ipFailures, err := p.incrementWithExpiry(ctx, ipFailureKey, p.policy.MaxLockout)
	if p.degradedAllow(err) {
		return
	}
	if err != nil {
		log.Printf(`{"level":"error","event":"auth_failure_record_error","scope":"%s","reason":"%s"}`, scope, RedactString(err.Error()))
		return
	}

	locked := false
	lockoutSeconds := 0
	if identifierFailures >= p.policy.IdentifierFailureLimit {
		lockoutSeconds = int(p.calculateLockout(identifierFailures, p.policy.IdentifierFailureLimit).Seconds())
		if err := p.rdb.Set(ctx, authAbuseLockoutKey(scope, "identifier", identifier), "1", time.Duration(lockoutSeconds)*time.Second).Err(); err == nil {
			locked = true
		}
	}

	if ipFailures >= p.policy.IPFailureLimit {
		ipLockout := int(p.calculateLockout(ipFailures, p.policy.IPFailureLimit).Seconds())
		if ipLockout > lockoutSeconds {
			lockoutSeconds = ipLockout
		}
		if err := p.rdb.Set(ctx, authAbuseLockoutKey(scope, "ip", ipAddress), "1", time.Duration(ipLockout)*time.Second).Err(); err == nil {
			locked = true
		}
	}

	log.Printf(`{"level":"warn","event":"auth_failure_recorded","scope":"%s","identifier_hash":"%s","ip_hash":"%s","reason":"%s","failure_count":%d,"locked":%t,"lockout_seconds":%d}`,
		scope,
		hashAuthDimension(identifier),
		hashAuthDimension(ipAddress),
		RedactString(reason),
		identifierFailures,
		locked,
		lockoutSeconds,
	)
}

func (p *AuthAbuseProtector) RecordSuccess(ctx context.Context, scope AuthAbuseScope, identifier string) {
	if p == nil || p.rdb == nil {
		return
	}

	identifier = normalizeAuthIdentifier(identifier)
	if err := p.rdb.Del(ctx,
		authAbuseFailureKey(scope, "identifier", identifier),
		authAbuseLockoutKey(scope, "identifier", identifier),
	).Err(); err != nil && !p.degradedAllow(err) {
		log.Printf(`{"level":"error","event":"auth_success_cleanup_error","scope":"%s","reason":"%s"}`, scope, RedactString(err.Error()))
	}
}

func (p *AuthAbuseProtector) calculateLockout(failureCount int, failureLimit int) time.Duration {
	extraFailures := failureCount - failureLimit
	if extraFailures < 0 {
		extraFailures = 0
	}

	multiplier := 1
	for i := 0; i < extraFailures && i < 3; i++ {
		multiplier *= 2
	}

	lockout := time.Duration(multiplier) * p.policy.BaseLockout
	if lockout > p.policy.MaxLockout {
		return p.policy.MaxLockout
	}
	return lockout
}

// S3-SEC-01: CheckMultiAccountDevice detects multiple accounts from the same device.
// Returns true (blocked) if the device already has >= maxAccounts users registered.
// Uses device_fingerprint_repo to count distinct users per device hash.
func (p *AuthAbuseProtector) CheckMultiAccountDevice(deviceIDHash string, maxAccounts int, existingUserCount int) (blocked bool, reason string) {
	if deviceIDHash == "" {
		return false, ""
	}

	// If this device already has maxAccounts or more distinct users, flag it
	if existingUserCount >= maxAccounts {
		return true, fmt.Sprintf(
			"device %s has %d users (max %d allowed)",
			deviceIDHash[:min(8, len(deviceIDHash))],
			existingUserCount,
			maxAccounts,
		)
	}
	return false, ""
}

// S3-SEC-02: CheckPromoAbuse detects mass promo claims from same device/IP.
// Flags when same device or IP claims more than maxClaims promos.
func (p *AuthAbuseProtector) CheckPromoAbuse(ctx context.Context, deviceIDHash string, ipAddress string, maxClaims int) (blocked bool, reason string) {
	if p == nil || p.rdb == nil {
		return false, ""
	}

	// Count promo claims per device in the last 24h
	deviceKey := fmt.Sprintf("promo_abuse:device:%s", deviceIDHash)
	deviceCount, err := p.rdb.Incr(ctx, deviceKey).Result()
	if err != nil {
		return false, ""
	}
	if deviceCount == 1 {
		p.rdb.Expire(ctx, deviceKey, 24*time.Hour)
	}
	if int(deviceCount) > maxClaims {
		return true, fmt.Sprintf("device claimed %d promos (max %d)", deviceCount, maxClaims)
	}

	// Count promo claims per IP in the last 24h
	ipKey := fmt.Sprintf("promo_abuse:ip:%s", ipAddress)
	ipCount, err := p.rdb.Incr(ctx, ipKey).Result()
	if err != nil {
		return false, ""
	}
	if ipCount == 1 {
		p.rdb.Expire(ctx, ipKey, 24*time.Hour)
	}
	if int(ipCount) > maxClaims*2 {
		return true, fmt.Sprintf("IP claimed %d promos (max %d)", ipCount, maxClaims*2)
	}

	return false, ""
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
