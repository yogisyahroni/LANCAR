package provider

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/http"
)

func verifyHMACSignature(headers http.Header, body []byte, secret string) error {
	if secret == "" {
		return errors.New("webhook verification secret is not configured")
	}
	received := headers.Get("X-Webhook-Signature")
	if received == "" {
		return errors.New("missing webhook signature")
	}
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write(body)
	expected := hex.EncodeToString(mac.Sum(nil))
	if !hmac.Equal([]byte(received), []byte(expected)) {
		return errors.New("invalid webhook signature")
	}
	return nil
}
