package domain

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"fmt"
	"math/big"
)

// sha256Hmac computes HMAC-SHA256 of plaintext keyed by salt, returns hex string.
func sha256Hmac(plaintext, salt string) string {
	mac := hmac.New(sha256.New, []byte(salt))
	mac.Write([]byte(plaintext))
	return hex.EncodeToString(mac.Sum(nil))
}

// subtleConstantTimeCompare compares two hex strings in constant time.
func subtleConstantTimeCompare(a, b string) bool {
	return subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1
}

// generateNumeric6 produces a 6-digit numeric string (000000–999999).
func generateNumeric6() (string, error) {
	n, err := rand.Int(rand.Reader, big.NewInt(1000000))
	if err != nil {
		return "", fmt.Errorf("generate numeric token: %w", err)
	}
	return fmt.Sprintf("%06d", n.Int64()), nil
}

// generateAlphanumeric16 produces a 16-char alphanumeric token.
func generateAlphanumeric16() (string, error) {
	const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	b := make([]byte, 16)
	for i := range b {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(len(chars))))
		if err != nil {
			return "", fmt.Errorf("generate alphanumeric token: %w", err)
		}
		b[i] = chars[n.Int64()]
	}
	return string(b), nil
}

// generateHex32 produces a 32-byte hex (64-char) string for QR payloads.
func generateHex32() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("generate hex token: %w", err)
	}
	return hex.EncodeToString(b), nil
}
