package service

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func TestAppleTokenVerifierAcceptsValidES256Token(t *testing.T) {
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	const kid = "test-apple-key"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"keys": []map[string]string{{
			"kid": kid,
			"kty": "EC",
			"use": "sig",
			"alg": "ES256",
			"crv": "P-256",
			"x":   base64.RawURLEncoding.EncodeToString(key.X.Bytes()),
			"y":   base64.RawURLEncoding.EncodeToString(key.Y.Bytes()),
		}}})
	}))
	defer server.Close()

	now := time.Now()
	token := jwt.NewWithClaims(jwt.SigningMethodES256, jwt.MapClaims{
		"iss":            "https://appleid.apple.com",
		"aud":            "com.tembus.web",
		"sub":            "apple-subject-1",
		"email":          "relay@example.com",
		"email_verified": true,
		"nonce":          "nonce-1",
		"iat":            now.Unix(),
		"exp":            now.Add(5 * time.Minute).Unix(),
	})
	token.Header["kid"] = kid
	signed, err := token.SignedString(key)
	if err != nil {
		t.Fatal(err)
	}

	verifier := NewAppleTokenVerifier([]string{"com.tembus.web"})
	verifier.jwksURL = server.URL
	claims, err := verifier.VerifyIDToken(context.Background(), signed, "nonce-1")
	if err != nil {
		t.Fatalf("expected valid token, got %v", err)
	}
	if claims.Sub != "apple-subject-1" || claims.Email != "relay@example.com" || !claims.EmailVerified {
		t.Fatalf("unexpected claims: %+v", claims)
	}
}

func TestAppleTokenVerifierRejectsAudienceAndNonce(t *testing.T) {
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	const kid = "test-apple-key"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"keys": []map[string]string{{
			"kid": kid, "kty": "EC", "alg": "ES256", "crv": "P-256",
			"x": base64.RawURLEncoding.EncodeToString(key.X.Bytes()),
			"y": base64.RawURLEncoding.EncodeToString(key.Y.Bytes()),
		}}})
	}))
	defer server.Close()

	token := jwt.NewWithClaims(jwt.SigningMethodES256, jwt.MapClaims{
		"iss": "https://appleid.apple.com", "aud": "wrong-client", "sub": "subject",
		"email": "user@example.com", "email_verified": true, "nonce": "real-nonce",
		"iat": time.Now().Unix(), "exp": time.Now().Add(time.Minute).Unix(),
	})
	token.Header["kid"] = kid
	signed, err := token.SignedString(key)
	if err != nil {
		t.Fatal(err)
	}

	verifier := NewAppleTokenVerifier([]string{"expected-client"})
	verifier.jwksURL = server.URL
	if _, err := verifier.VerifyIDToken(context.Background(), signed, "real-nonce"); err == nil {
		t.Fatal("expected audience rejection")
	}

	// Use the expected audience but a mismatched nonce to verify replay binding.
	second := jwt.NewWithClaims(jwt.SigningMethodES256, jwt.MapClaims{
		"iss": "https://appleid.apple.com", "aud": "expected-client", "sub": "subject",
		"email": "user@example.com", "email_verified": true, "nonce": "real-nonce",
		"iat": time.Now().Unix(), "exp": time.Now().Add(time.Minute).Unix(),
	})
	second.Header["kid"] = kid
	secondSigned, err := second.SignedString(key)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := verifier.VerifyIDToken(context.Background(), secondSigned, "other-nonce"); err == nil {
		t.Fatal("expected nonce rejection")
	}
}
