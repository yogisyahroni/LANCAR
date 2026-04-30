package domain

import "context"

type UserRepository interface {
	GetByPhoneNumber(ctx context.Context, phoneNumber string) (*User, error)
	Create(ctx context.Context, user *User) error
	Update(ctx context.Context, user *User) error
}

type AuthRepository interface {
	SaveOTP(ctx context.Context, otp *OTPLog) error
	VerifyOTP(ctx context.Context, phoneNumber, code string) (*OTPLog, error)
	MarkOTPAsUsed(ctx context.Context, id string) error
}
