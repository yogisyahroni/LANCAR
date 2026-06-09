package service

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
)

// ─────────────────────────────────────────────
// Google ID Token Verifier
// ─────────────────────────────────────────────

// googleJWKSCache is the cached Google public key set.
type googleJWKSCache struct {
	keys      []googleJWK
	fetchedAt time.Time
	mu        sync.RWMutex
}

// googleJWK represents a single JSON Web Key from Google's JWKS endpoint.
type googleJWK struct {
	Kid string `json:"kid"`
	N   string `json:"n"`
	E   string `json:"e"`
	Alg string `json:"alg"`
	Use string `json:"use"`
	Kty string `json:"kty"`
}

type googleJWKSResponse struct {
	Keys []googleJWK `json:"keys"`
}

// GoogleIDTokenClaims contains the verified claims from a Google ID token.
type GoogleIDTokenClaims struct {
	Sub           string // Stable Google subject (user identifier) — never log
	Email         string
	EmailVerified bool
	FullName      string
	Picture       string
	Nonce         string
	Aud           string
	Iss           string
	Iat           int64
	Exp           int64
}

// GoogleTokenVerifier verifies Google ID tokens using JWKS with caching.
type GoogleTokenVerifier struct {
	allowedClientIDs []string
	jwksURL          string
	httpClient       *http.Client
	cache            *googleJWKSCache
	cacheTTL         time.Duration
}

const googleJWKSEndpoint = "https://www.googleapis.com/oauth2/v3/certs"

// NewGoogleTokenVerifier creates a verifier for the given allowed client IDs.
// clientIDs should include both web and Android customer client IDs.
func NewGoogleTokenVerifier(clientIDs []string) *GoogleTokenVerifier {
	return &GoogleTokenVerifier{
		allowedClientIDs: clientIDs,
		jwksURL:          googleJWKSEndpoint,
		httpClient: &http.Client{
			Timeout: 5 * time.Second,
		},
		cache:    &googleJWKSCache{},
		cacheTTL: 60 * time.Minute,
	}
}

// VerifyIDToken validates a Google ID token and returns its claims.
// Enforces: valid signature, correct issuer, allowed audience,
// not expired, email_verified == true, optional nonce match.
func (v *GoogleTokenVerifier) VerifyIDToken(ctx context.Context, idToken string, expectedNonce string) (*GoogleIDTokenClaims, error) {
	parts := strings.Split(idToken, ".")
	if len(parts) != 3 {
		return nil, fmt.Errorf("google token: malformed JWT (expected 3 parts, got %d)", len(parts))
	}

	// Decode JWT header to get kid and alg
	headerJSON, err := decodeJWTPart(parts[0])
	if err != nil {
		return nil, fmt.Errorf("google token: failed to decode header: %w", err)
	}
	var header struct {
		Kid string `json:"kid"`
		Alg string `json:"alg"`
	}
	if err := json.Unmarshal(headerJSON, &header); err != nil {
		return nil, fmt.Errorf("google token: failed to parse header: %w", err)
	}
	if header.Alg != "RS256" {
		return nil, fmt.Errorf("google token: unexpected algorithm %q, expected RS256", header.Alg)
	}

	// Decode JWT payload
	payloadJSON, err := decodeJWTPart(parts[1])
	if err != nil {
		return nil, fmt.Errorf("google token: failed to decode payload: %w", err)
	}

	var rawClaims map[string]interface{}
	if err := json.Unmarshal(payloadJSON, &rawClaims); err != nil {
		return nil, fmt.Errorf("google token: failed to parse payload: %w", err)
	}

	// Validate issuer
	iss, _ := rawClaims["iss"].(string)
	if iss != "accounts.google.com" && iss != "https://accounts.google.com" {
		return nil, fmt.Errorf("google token: invalid issuer")
	}

	// Validate audience
	aud := extractAudience(rawClaims["aud"])
	if !v.isAudienceAllowed(aud) {
		return nil, fmt.Errorf("google token: audience not allowed")
	}

	// Validate expiry
	exp, _ := rawClaims["exp"].(float64)
	if time.Now().Unix() > int64(exp) {
		return nil, fmt.Errorf("google token: token is expired")
	}

	// Validate email_verified
	emailVerified, _ := rawClaims["email_verified"].(bool)
	if !emailVerified {
		return nil, fmt.Errorf("google token: email is not verified")
	}

	// Validate nonce if expected
	if expectedNonce != "" {
		nonce, _ := rawClaims["nonce"].(string)
		if !v.nonceMatches(nonce, expectedNonce) {
			return nil, fmt.Errorf("google token: nonce mismatch")
		}
	}

	// Verify signature via Google's tokeninfo endpoint (covers RS256 without external RSA lib)
	if err := v.verifyViaTokenInfo(ctx, idToken, aud); err != nil {
		return nil, fmt.Errorf("google token: signature verification failed: %w", err)
	}

	// Extract claims for return
	sub, _ := rawClaims["sub"].(string)
	email, _ := rawClaims["email"].(string)
	fullName, _ := rawClaims["name"].(string)
	picture, _ := rawClaims["picture"].(string)
	nonce, _ := rawClaims["nonce"].(string)
	iat, _ := rawClaims["iat"].(float64)

	if sub == "" {
		return nil, fmt.Errorf("google token: missing sub claim")
	}
	if email == "" {
		return nil, fmt.Errorf("google token: missing email claim")
	}

	return &GoogleIDTokenClaims{
		Sub:           sub,
		Email:         strings.ToLower(strings.TrimSpace(email)),
		EmailVerified: emailVerified,
		FullName:      fullName,
		Picture:       picture,
		Nonce:         nonce,
		Aud:           aud,
		Iss:           iss,
		Iat:           int64(iat),
		Exp:           int64(exp),
	}, nil
}

// isAudienceAllowed checks if the token audience matches one of the configured client IDs.
func (v *GoogleTokenVerifier) isAudienceAllowed(aud string) bool {
	for _, allowed := range v.allowedClientIDs {
		if aud == allowed {
			return true
		}
	}
	return false
}

// nonceMatches compares the token nonce against the expected value.
// Supports both raw comparison and SHA-256 hash comparison (for hashed nonces).
func (v *GoogleTokenVerifier) nonceMatches(tokenNonce, expectedNonce string) bool {
	if tokenNonce == expectedNonce {
		return true
	}
	sum := sha256.Sum256([]byte(expectedNonce))
	expectedHash := fmt.Sprintf("%x", sum)
	return tokenNonce == expectedHash
}

// getJWKS returns cached JWKS or fetches fresh from Google.
func (v *GoogleTokenVerifier) getJWKS(ctx context.Context) ([]googleJWK, error) {
	v.cache.mu.RLock()
	if time.Since(v.cache.fetchedAt) < v.cacheTTL && len(v.cache.keys) > 0 {
		keys := v.cache.keys
		v.cache.mu.RUnlock()
		return keys, nil
	}
	v.cache.mu.RUnlock()

	v.cache.mu.Lock()
	defer v.cache.mu.Unlock()

	// Re-check after acquiring write lock
	if time.Since(v.cache.fetchedAt) < v.cacheTTL && len(v.cache.keys) > 0 {
		return v.cache.keys, nil
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, v.jwksURL, nil)
	if err != nil {
		return nil, err
	}
	resp, err := v.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("JWKS fetch failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("JWKS fetch returned HTTP %d", resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 32768))
	if err != nil {
		return nil, err
	}

	var jwksResp googleJWKSResponse
	if err := json.Unmarshal(body, &jwksResp); err != nil {
		return nil, fmt.Errorf("failed to parse JWKS: %w", err)
	}
	if len(jwksResp.Keys) == 0 {
		return nil, fmt.Errorf("JWKS response contains no keys")
	}

	v.cache.keys = jwksResp.Keys
	v.cache.fetchedAt = time.Now()
	return v.cache.keys, nil
}

// verifyViaTokenInfo validates the token using Google's tokeninfo endpoint.
// This is our signature verification method (avoids dependency on RSA library).
func (v *GoogleTokenVerifier) verifyViaTokenInfo(ctx context.Context, idToken, expectedAud string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		"https://oauth2.googleapis.com/tokeninfo?id_token="+idToken, nil)
	if err != nil {
		return err
	}
	resp, err := v.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("tokeninfo request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		return fmt.Errorf("tokeninfo returned HTTP %d: %s", resp.StatusCode, string(body))
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if err != nil {
		return err
	}

	var result struct {
		Aud   string `json:"aud"`
		Error string `json:"error"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return fmt.Errorf("failed to parse tokeninfo: %w", err)
	}
	if result.Error != "" {
		return fmt.Errorf("tokeninfo error: %s", result.Error)
	}
	if !v.isAudienceAllowed(result.Aud) {
		return fmt.Errorf("tokeninfo: audience not allowed")
	}
	return nil
}

// ─────────────────────────────────────────────
// JWT helpers
// ─────────────────────────────────────────────

// decodeJWTPart decodes a base64url-encoded JWT part (header or payload).
func decodeJWTPart(s string) ([]byte, error) {
	// JWT uses base64url encoding without padding
	return base64.RawURLEncoding.DecodeString(s)
}

// extractAudience handles both string and []interface{} aud claim.
func extractAudience(aud interface{}) string {
	switch v := aud.(type) {
	case string:
		return v
	case []interface{}:
		if len(v) > 0 {
			if s, ok := v[0].(string); ok {
				return s
			}
		}
	}
	return ""
}

// GoogleClaims is an alias for GoogleIDTokenClaims used from the service layer.
type GoogleClaims = GoogleIDTokenClaims
