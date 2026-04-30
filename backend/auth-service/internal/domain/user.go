package domain

import (
	"time"
)

type UserStatus string

const (
	StatusActive              UserStatus = "active"
	StatusInactive            UserStatus = "inactive"
	StatusSuspended           UserStatus = "suspended"
	StatusPendingVerification UserStatus = "pending_verification"
)

type User struct {
	ID           string     `json:"id" db:"id"`
	PhoneNumber  string     `json:"phone_number" db:"phone_number"`
	Email        *string    `json:"email" db:"email"`
	FullName     string     `json:"full_name" db:"full_name"`
	PhotoURL     *string    `json:"photo_url" db:"photo_url"`
	Role         UserRole   `json:"role" db:"role"`
	Status       UserStatus `json:"status" db:"status"`
	ReferralCode *string    `json:"referral_code" db:"referral_code"`
	ReferredBy   *string    `json:"referred_by" db:"referred_by"`
	PINHash      *string    `json:"-" db:"pin_hash"`
	IsVerified   bool       `json:"is_verified" db:"is_verified"`
	LastLoginAt  *time.Time `json:"last_login_at" db:"last_login_at"`
	CreatedAt    time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at" db:"updated_at"`
}

type OTPLog struct {
	ID          string    `json:"id" db:"id"`
	PhoneNumber string    `json:"phone_number" db:"phone_number"`
	Code        string    `json:"code" db:"code"`
	ExpiresAt   time.Time `json:"expires_at" db:"expires_at"`
	IsUsed      bool      `json:"is_used" db:"is_used"`
	CreatedAt   time.Time `json:"created_at" db:"created_at"`
}
