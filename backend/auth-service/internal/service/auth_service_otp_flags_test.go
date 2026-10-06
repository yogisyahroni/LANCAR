package service

import (
	"context"
	"errors"
	"testing"

	"tembus/auth-service/internal/domain"
)

type registrationOTPFlagRepo struct {
	flags map[string]bool
	err   error
}

func (r registrationOTPFlagRepo) SaveOTP(context.Context, *domain.OTPLog) error { return nil }

func (r registrationOTPFlagRepo) VerifyOTP(context.Context, string, string) (*domain.OTPLog, error) {
	return nil, nil
}

func (r registrationOTPFlagRepo) MarkOTPAsUsed(context.Context, string) error { return nil }

func (r registrationOTPFlagRepo) IsFeatureFlagEnabled(_ context.Context, key string, defaultValue bool) (bool, error) {
	if r.err != nil {
		return defaultValue, r.err
	}
	value, ok := r.flags[key]
	if !ok {
		return defaultValue, nil
	}
	return value, nil
}

func TestIsCustomerRegistrationOTPRequiredIsScopedAndFailClosed(t *testing.T) {
	tests := []struct {
		name     string
		flags    map[string]bool
		err      error
		expected bool
	}{
		{
			name: "registration flag can disable only registration",
			flags: map[string]bool{
				customerAuthOTPRequiredFlag:         true,
				customerRegistrationOTPRequiredFlag: false,
			},
			expected: false,
		},
		{
			name: "production defaults remain required",
			flags: map[string]bool{
				customerAuthOTPRequiredFlag:         true,
				customerRegistrationOTPRequiredFlag: true,
			},
			expected: true,
		},
		{
			name: "global auth flag still gates registration",
			flags: map[string]bool{
				customerAuthOTPRequiredFlag:         false,
				customerRegistrationOTPRequiredFlag: true,
			},
			expected: false,
		},
		{
			name:     "feature flag lookup errors fail closed",
			flags:    map[string]bool{},
			err:      errors.New("feature flag store unavailable"),
			expected: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			svc := &AuthService{authRepo: registrationOTPFlagRepo{flags: tt.flags, err: tt.err}}
			if got := svc.isCustomerRegistrationOTPRequired(context.Background()); got != tt.expected {
				t.Fatalf("isCustomerRegistrationOTPRequired() = %v, want %v", got, tt.expected)
			}
		})
	}
}
