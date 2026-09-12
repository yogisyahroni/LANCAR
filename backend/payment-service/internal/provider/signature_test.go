package provider

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"testing"
)

func TestVerifyHMACSHA256FailsClosedAndAcceptsCanonicalSignature(t *testing.T) {
	payload := []byte(`{"event":"settlement"}`)
	if err := VerifyHMACSHA256(payload, "", "secret"); err == nil {
		t.Fatal("missing signature must fail closed")
	}
	if err := VerifyHMACSHA256(payload, "sha256=not-valid", "secret"); err == nil {
		t.Fatal("invalid signature must fail closed")
	}
	h := hmac.New(sha256.New, []byte("secret"))
	_, _ = h.Write(payload)
	if err := VerifyHMACSHA256(payload, "sha256="+hex.EncodeToString(h.Sum(nil)), "secret"); err != nil {
		t.Fatalf("provider-computed signature should pass: %v", err)
	}
}
