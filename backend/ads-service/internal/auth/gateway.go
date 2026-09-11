package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"
)

const (
	internalAuthHeader   = "X-Internal-Auth"
	internalAuthTSHeader = "X-Internal-Auth-TS"
	maxClockSkew         = 5 * time.Minute
)

// RequireGatewayAuth accepts only the identity context signed by the API
// gateway. Ads is reachable on the compose network, but it must not trust
// caller-supplied X-User-* headers or a caller-supplied context marker.
// Health endpoints remain public for container orchestration.
func RequireGatewayAuth(secret string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/health" || r.URL.Path == "/ready" {
			next.ServeHTTP(w, r)
			return
		}
		// Order-service sends conversion events over the compose network using
		// its own payload-bound service signature. The conversion handler does
		// the second verification; it is not a public gateway route.
		if r.URL.Path == "/internal/v1/ads/conversions" {
			next.ServeHTTP(w, r)
			return
		}
		if err := verify(r, secret, time.Now().UTC()); err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			_, _ = w.Write([]byte(`{"status":"error","code":"ERR_INVALID_GATEWAY_CONTEXT","message":"signed gateway context is required"}`))
			return
		}
		next.ServeHTTP(w, r)
	})
}

// VerifyOrderEvent verifies a payload-bound service-to-service event. The
// payload parts are supplied by the decoded handler request so a valid
// signature cannot be replayed for a different campaign/order pair.
func VerifyOrderEvent(secret string, r *http.Request, payloadParts ...string) error {
	if len(secret) < 32 {
		return errors.New("order event secret is not configured")
	}
	timestamp := strings.TrimSpace(r.Header.Get("X-Ads-Event-Timestamp"))
	provided := strings.TrimSpace(r.Header.Get("X-Ads-Event-Signature"))
	if timestamp == "" || provided == "" {
		return errors.New("order event signature is missing")
	}
	stamp, err := strconv.ParseInt(timestamp, 10, 64)
	if err != nil || time.Since(time.UnixMilli(stamp)) > maxClockSkew || time.UnixMilli(stamp).Sub(time.Now()) > maxClockSkew {
		return errors.New("order event signature timestamp is expired")
	}
	parts := append([]string{timestamp}, payloadParts...)
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(strings.Join(parts, ".")))
	expected := mac.Sum(nil)
	supplied, err := hex.DecodeString(provided)
	if err != nil || len(supplied) != len(expected) || subtle.ConstantTimeCompare(supplied, expected) != 1 {
		return errors.New("order event signature mismatch")
	}
	return nil
}

func verify(r *http.Request, secret string, now time.Time) error {
	if len(secret) < 32 {
		return errors.New("gateway secret is not configured")
	}
	userID := strings.TrimSpace(r.Header.Get("X-User-ID"))
	if userID == "" {
		return errors.New("gateway user identity is missing")
	}
	timestamp := strings.TrimSpace(r.Header.Get(internalAuthTSHeader))
	provided := strings.TrimSpace(r.Header.Get(internalAuthHeader))
	if timestamp == "" || provided == "" {
		return errors.New("gateway signature is missing")
	}
	stamp, err := strconv.ParseInt(timestamp, 10, 64)
	if err != nil || now.Sub(time.UnixMilli(stamp)) > maxClockSkew || time.UnixMilli(stamp).Sub(now) > maxClockSkew {
		return errors.New("gateway signature timestamp is expired")
	}
	role := r.Header.Get("X-User-Role")
	fullName := r.Header.Get("X-User-Full-Name")
	totp := r.Header.Get("X-Totp-Verified")
	payload := strings.Join([]string{timestamp, userID, role, fullName, totp}, ".")
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(payload))
	expected := mac.Sum(nil)
	supplied, err := hex.DecodeString(provided)
	if err != nil || len(supplied) != len(expected) || subtle.ConstantTimeCompare(supplied, expected) != 1 {
		return errors.New("gateway signature mismatch")
	}
	return nil
}
