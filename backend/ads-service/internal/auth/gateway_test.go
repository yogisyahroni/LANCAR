package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestGatewayAuthFailsClosedWithoutSignature(t *testing.T) {
	secret := "gateway-secret-for-ads-tests-min-32"
	req := httptest.NewRequest("GET", "/api/v1/ads/placements/food_discovery", nil)
	req.Header.Set("X-User-ID", "08a27156-9320-45c9-8a7a-02c11d06a5cc")
	res := httptest.NewRecorder()
	RequireGatewayAuth(secret, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(204)
	})).ServeHTTP(res, req)
	if res.Code != 401 {
		t.Fatalf("unsigned gateway context returned %d", res.Code)
	}
}

func TestGatewayAuthAcceptsSignedContextAndKeepsHealthPublic(t *testing.T) {
	secret := "gateway-secret-for-ads-tests-min-32"
	// Build a signed request directly so this test remains independent of a
	// running gateway/container.
	timestamp := strconv.FormatInt(time.Now().UnixMilli(), 10)
	req := httptest.NewRequest("GET", "/api/v1/ads/placements/food_discovery", nil)
	for key, value := range map[string]string{"X-User-ID": "08a27156-9320-45c9-8a7a-02c11d06a5cc", "X-User-Role": "customer", "X-User-Full-Name": "Staging User", "X-Totp-Verified": "false"} {
		req.Header.Set(key, value)
	}
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(strings.Join([]string{timestamp, req.Header.Get("X-User-ID"), req.Header.Get("X-User-Role"), req.Header.Get("X-User-Full-Name"), req.Header.Get("X-Totp-Verified")}, ".")))
	req.Header.Set("X-Internal-Auth-TS", timestamp)
	req.Header.Set("X-Internal-Auth", hex.EncodeToString(mac.Sum(nil)))
	res := httptest.NewRecorder()
	called := false
	RequireGatewayAuth(secret, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { called = true; w.WriteHeader(204) })).ServeHTTP(res, req)
	if res.Code != 204 || !called {
		t.Fatalf("signed gateway context was not accepted: code=%d called=%v", res.Code, called)
	}
	health := httptest.NewRequest("GET", "/health", nil)
	healthRes := httptest.NewRecorder()
	RequireGatewayAuth(secret, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(204) })).ServeHTTP(healthRes, health)
	if healthRes.Code != 204 {
		t.Fatalf("health endpoint should remain public, got %d", healthRes.Code)
	}
}

func TestOrderEventSignatureBindsPayload(t *testing.T) {
	secret := "order-event-secret-for-ads-tests-32"
	timestamp := strconv.FormatInt(time.Now().UnixMilli(), 10)
	req := httptest.NewRequest("POST", "/internal/v1/ads/conversions", nil)
	campaign := "f43118b8-1ce9-4d43-9486-f0b3f91bd967"
	order := "11111111-1111-1111-1111-111111111111"
	idem := "conversion-test-1"
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(strings.Join([]string{timestamp, campaign, order, idem}, ".")))
	req.Header.Set("X-Ads-Event-Timestamp", timestamp)
	req.Header.Set("X-Ads-Event-Signature", hex.EncodeToString(mac.Sum(nil)))
	if err := VerifyOrderEvent(secret, req, campaign, order, idem); err != nil {
		t.Fatalf("valid order event signature rejected: %v", err)
	}
	if err := VerifyOrderEvent(secret, req, campaign, order, "different-idempotency-key"); err == nil {
		t.Fatal("order event signature was not bound to idempotency payload")
	}
}
