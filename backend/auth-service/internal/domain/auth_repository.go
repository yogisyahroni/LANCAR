package domain

import "context"

type AuthRepository interface {
	SaveOTP(ctx context.Context, otp *OTPLog) error
	VerifyOTP(ctx context.Context, phoneNumber, code string) (*OTPLog, error)
	MarkOTPAsUsed(ctx context.Context, id string) error
	IsFeatureFlagEnabled(ctx context.Context, key string, defaultValue bool) (bool, error)
}
