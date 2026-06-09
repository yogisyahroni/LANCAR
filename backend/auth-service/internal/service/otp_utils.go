package service

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"strings"
	"time"

	"tembus/auth-service/internal/domain"
)

// ─────────────────────────────────────────────
// OTP Code generation and hashing
// ─────────────────────────────────────────────

// generateNumericOTP generates a random numeric OTP of the given length.
func generateNumericOTP(length int) (string, error) {
	if length < 4 || length > 10 {
		return "", fmt.Errorf("otp length must be between 4 and 10, got %d", length)
	}
	b := make([]byte, length)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("failed to generate random bytes: %w", err)
	}
	digits := make([]byte, length)
	for i, v := range b {
		digits[i] = '0' + (v % 10)
	}
	return string(digits), nil
}

// otpPepper reads the OTP_HASH_PEPPER env variable.
// Returns an error if running in production and pepper is empty.
func otpPepper() (string, error) {
	pepper := os.Getenv("OTP_HASH_PEPPER")
	if pepper == "" {
		env := strings.ToLower(os.Getenv("ENVIRONMENT"))
		if env == "production" {
			return "", fmt.Errorf("OTP_HASH_PEPPER must be set in production")
		}
		// Non-prod fallback — NEVER use in production
		return "dev-pepper-not-for-production", nil
	}
	return pepper, nil
}

// HashOTPCode computes HMAC-SHA256(code, pepper).
// The result is stored in the database instead of the plaintext code.
func HashOTPCode(code string) (string, error) {
	pepper, err := otpPepper()
	if err != nil {
		return "", err
	}
	mac := hmac.New(sha256.New, []byte(pepper))
	mac.Write([]byte(code))
	return hex.EncodeToString(mac.Sum(nil)), nil
}

// VerifyOTPCode checks whether code matches the stored hash using constant-time comparison.
func VerifyOTPCode(code, storedHash string) (bool, error) {
	computed, err := HashOTPCode(code)
	if err != nil {
		return false, err
	}
	return hmac.Equal([]byte(computed), []byte(storedHash)), nil
}

// ─────────────────────────────────────────────
// Phone number masking
// ─────────────────────────────────────────────

// MaskPhoneNumber masks the middle portion of a phone number.
// Input: "+6281234567890" → Output: "+62****4567890" (shows first 3 and last 4 digits)
func MaskPhoneNumber(phone string) string {
	phone = strings.TrimSpace(phone)
	if len(phone) < 8 {
		return "****"
	}
	// Determine prefix and suffix lengths
	prefixLen := 3
	if strings.HasPrefix(phone, "+") {
		prefixLen = 4 // e.g. "+62" = 3 chars + at least 1 digit
	}
	suffixLen := 4
	if len(phone) <= prefixLen+suffixLen {
		return phone[:2] + "****"
	}
	prefix := phone[:prefixLen]
	suffix := phone[len(phone)-suffixLen:]
	masked := strings.Repeat("*", len(phone)-prefixLen-suffixLen)
	return prefix + masked + suffix
}

// ─────────────────────────────────────────────
// DryRunOTPProvider
// ─────────────────────────────────────────────

// DryRunOTPProvider is used in local/dev/test environments.
// It logs the OTP to stdout (structured JSON) instead of calling a real provider.
// It MUST NOT be used in production.
type DryRunOTPProvider struct{}

func NewDryRunOTPProvider() *DryRunOTPProvider {
	return &DryRunOTPProvider{}
}

func (p *DryRunOTPProvider) Name() domain.OTPProviderName {
	return domain.OTPProviderDryRun
}

// SendOTP logs the OTP code to stdout in structured JSON and returns a fake message id.
func (p *DryRunOTPProvider) SendOTP(ctx context.Context, req domain.OTPSendRequest) (domain.OTPSendResult, error) {
	fakeMessageID := fmt.Sprintf("dry-run-%d", time.Now().UnixNano())
	// Log OTP to stdout ONLY in dry-run mode for development debugging.
	// In production, the live provider is used and OTP is never logged.
	fmt.Printf(
		`{"event":"otp_dry_run","channel":"%s","purpose":"%s","otp_code":"%s","idempotency_key":"%s","correlation_id":"%s","message_id":"%s","ts":"%s"}`+"\n",
		req.Channel, req.Purpose, req.OTPCode,
		req.IdempotencyKey, req.CorrelationID, fakeMessageID,
		time.Now().UTC().Format(time.RFC3339),
	)
	return domain.OTPSendResult{
		ProviderMessageID: fakeMessageID,
		Channel:           req.Channel,
		Status:            domain.OTPDeliveryAccepted,
		Retryable:         false,
		NormalizedError:   "",
		LatencyMS:         0,
	}, nil
}

// CheckDeliveryStatus always returns "delivered" in dry-run mode.
func (p *DryRunOTPProvider) CheckDeliveryStatus(ctx context.Context, providerMessageID string) (domain.OTPDeliveryStatusResult, error) {
	now := time.Now().Unix()
	return domain.OTPDeliveryStatusResult{
		ProviderMessageID: providerMessageID,
		Status:            domain.OTPDeliveryDelivered,
		DeliveredAt:       &now,
	}, nil
}

// VerifyWebhookSignature always succeeds in dry-run mode.
func (p *DryRunOTPProvider) VerifyWebhookSignature(payload []byte, signature string, timestamp string) error {
	return nil
}
