package domain

import "context"

type UserRole string

const (
	RoleCustomer UserRole = "customer"
	RoleCourier  UserRole = "courier"
	RoleAdmin    UserRole = "admin"
)

type UserRepository interface {
	GetByPhoneNumber(ctx context.Context, phoneNumber string) (*User, error)
	GetByID(ctx context.Context, id string) (*User, error)
	Create(ctx context.Context, user *User) error
	Update(ctx context.Context, user *User) error
	SetPIN(ctx context.Context, userID, pinHash string) error
}

type AuthRepository interface {
	SaveOTP(ctx context.Context, otp *OTPLog) error
	VerifyOTP(ctx context.Context, phoneNumber, code string) (*OTPLog, error)
	MarkOTPAsUsed(ctx context.Context, id string) error
}
