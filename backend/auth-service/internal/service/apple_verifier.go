package service

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const appleJWKSEndpoint = "https://appleid.apple.com/auth/keys"

// AppleTokenVerifier verifies Apple Sign in with Apple identity tokens using
// Apple's rotating ES256 public keys. Keys are cached briefly to avoid making
// the auth endpoint dependent on a request per login.
type AppleTokenVerifier struct {
	allowedClientIDs []string
	jwksURL          string
	httpClient       *http.Client
	mu               sync.Mutex
	keys             map[string]*ecdsa.PublicKey
	keysFetchedAt    time.Time
}

type appleJWK struct {
	Kid string `json:"kid"`
	Kty string `json:"kty"`
	Use string `json:"use"`
	Alg string `json:"alg"`
	Crv string `json:"crv"`
	X   string `json:"x"`
	Y   string `json:"y"`
}

type appleJWKS struct {
	Keys []appleJWK `json:"keys"`
}

// NewAppleTokenVerifier creates an Apple verifier for web and native client
// identifiers. Empty identifiers intentionally reject every token.
func NewAppleTokenVerifier(clientIDs []string) *AppleTokenVerifier {
	return &AppleTokenVerifier{
		allowedClientIDs: clientIDs,
		jwksURL:          appleJWKSEndpoint,
		httpClient:       &http.Client{Timeout: 5 * time.Second},
		keys:             make(map[string]*ecdsa.PublicKey),
	}
}

// VerifyIDToken validates issuer, audience, expiry, nonce and the ES256
// signature. Apple may omit email after the first authorization, so the
// stable subject is the required identity claim.
func (v *AppleTokenVerifier) VerifyIDToken(ctx context.Context, idToken, expectedNonce string) (*GoogleIDTokenClaims, error) {
	if len(v.allowedClientIDs) == 0 {
		return nil, fmt.Errorf("apple token: no client IDs configured")
	}

	claims := jwt.MapClaims{}
	token, err := jwt.ParseWithClaims(idToken, claims, func(token *jwt.Token) (interface{}, error) {
		if token.Method != jwt.SigningMethodES256 {
			return nil, fmt.Errorf("apple token: unexpected algorithm %q", token.Method.Alg())
		}
		kid, ok := token.Header["kid"].(string)
		if !ok || strings.TrimSpace(kid) == "" {
			return nil, fmt.Errorf("apple token: missing key ID")
		}
		return v.publicKey(ctx, kid)
	}, jwt.WithValidMethods([]string{"ES256"}), jwt.WithIssuer("https://appleid.apple.com"))
	if err != nil || token == nil || !token.Valid {
		return nil, fmt.Errorf("apple token: signature or claims invalid: %w", err)
	}

	iss, _ := claims["iss"].(string)
	aud := extractAudience(claims["aud"])
	sub, _ := claims["sub"].(string)
	email, _ := claims["email"].(string)
	email = strings.ToLower(strings.TrimSpace(email))
	if iss != "https://appleid.apple.com" || !v.isAudienceAllowed(aud) || sub == "" {
		return nil, fmt.Errorf("apple token: issuer, audience or subject invalid")
	}

	exp, ok := numericClaim(claims["exp"])
	if !ok || time.Now().Unix() >= exp {
		return nil, fmt.Errorf("apple token: token is expired")
	}
	if expectedNonce != "" {
		nonce, _ := claims["nonce"].(string)
		if !nonceMatches(nonce, expectedNonce) {
			return nil, fmt.Errorf("apple token: nonce mismatch")
		}
	}

	verified := false
	switch value := claims["email_verified"].(type) {
	case bool:
		verified = value
	case string:
		verified = strings.EqualFold(value, "true")
	}
	// Apple identity tokens are only accepted for customer login when the
	// provider asserts a verified email. Existing relay-email accounts retain
	// that claim on subsequent logins.
	if !verified {
		return nil, fmt.Errorf("apple token: email is not verified")
	}

	return &GoogleIDTokenClaims{
		Sub:           sub,
		Email:         email,
		EmailVerified: verified,
		FullName:      claimString(claims, "name"),
		Nonce:         claimString(claims, "nonce"),
		Aud:           aud,
		Iss:           iss,
		Iat:           mustNumericClaim(claims["iat"]),
		Exp:           exp,
	}, nil
}

func (v *AppleTokenVerifier) isAudienceAllowed(aud string) bool {
	for _, allowed := range v.allowedClientIDs {
		if aud == allowed {
			return true
		}
	}
	return false
}

func (v *AppleTokenVerifier) publicKey(ctx context.Context, kid string) (*ecdsa.PublicKey, error) {
	v.mu.Lock()
	if key, ok := v.keys[kid]; ok && time.Since(v.keysFetchedAt) < time.Hour {
		v.mu.Unlock()
		return key, nil
	}
	v.mu.Unlock()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, v.jwksURL, nil)
	if err != nil {
		return nil, err
	}
	resp, err := v.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("jwks request failed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("jwks returned HTTP %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 64*1024))
	if err != nil {
		return nil, err
	}
	var document appleJWKS
	if err := json.Unmarshal(body, &document); err != nil {
		return nil, fmt.Errorf("invalid jwks: %w", err)
	}
	keys := make(map[string]*ecdsa.PublicKey, len(document.Keys))
	for _, jwk := range document.Keys {
		if jwk.Kty != "EC" || jwk.Crv != "P-256" || jwk.Alg != "ES256" || jwk.X == "" || jwk.Y == "" {
			continue
		}
		x, errX := base64.RawURLEncoding.DecodeString(jwk.X)
		y, errY := base64.RawURLEncoding.DecodeString(jwk.Y)
		if errX != nil || errY != nil {
			continue
		}
		key := &ecdsa.PublicKey{Curve: elliptic.P256(), X: new(big.Int).SetBytes(x), Y: new(big.Int).SetBytes(y)}
		if !key.Curve.IsOnCurve(key.X, key.Y) {
			continue
		}
		keys[jwk.Kid] = key
	}
	v.mu.Lock()
	v.keys = keys
	v.keysFetchedAt = time.Now()
	key := v.keys[kid]
	v.mu.Unlock()
	if key == nil {
		return nil, fmt.Errorf("apple token: unknown key ID")
	}
	return key, nil
}

func numericClaim(value interface{}) (int64, bool) {
	switch number := value.(type) {
	case float64:
		return int64(number), number > 0
	case json.Number:
		parsed, err := number.Int64()
		return parsed, err == nil
	default:
		return 0, false
	}
}

func mustNumericClaim(value interface{}) int64 {
	parsed, _ := numericClaim(value)
	return parsed
}

func claimString(claims jwt.MapClaims, name string) string {
	value, _ := claims[name].(string)
	return value
}

func nonceMatches(tokenNonce, expectedNonce string) bool {
	if tokenNonce == expectedNonce {
		return true
	}
	hash := sha256.Sum256([]byte(expectedNonce))
	return tokenNonce == fmt.Sprintf("%x", hash)
}
