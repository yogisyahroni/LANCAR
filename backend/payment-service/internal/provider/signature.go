package provider

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"strings"
)

// VerifyHMACSHA256 is a provider-adapter primitive. Provider-specific
// adapters may choose another documented scheme, but all comparisons must be
// constant-time and malformed signatures must fail closed.
func VerifyHMACSHA256(payload []byte, signature, secret string) error {
	if len(payload) == 0 || strings.TrimSpace(signature) == "" || strings.TrimSpace(secret) == "" {
		return errors.New("provider signature inputs are required")
	}
	digest := hmac.New(sha256.New, []byte(secret))
	_, _ = digest.Write(payload)
	expected := hex.EncodeToString(digest.Sum(nil))
	provided := strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(signature), "sha256="))
	if len(provided) != len(expected) || subtle.ConstantTimeCompare([]byte(strings.ToLower(provided)), []byte(expected)) != 1 {
		return errors.New("provider signature verification failed")
	}
	return nil
}
