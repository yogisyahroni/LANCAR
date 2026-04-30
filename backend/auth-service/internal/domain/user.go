package domain

import (
	"time"
)

type UserRole string

const (
	RoleCustomer UserRole = "customer"
	RoleCourier  UserRole = "courier"
	RoleAdmin    UserRole = "admin"
)

type User struct {
	ID          string    `json:"id" db:"id"`
	PhoneNumber string    `json:"phone_number" db:"phone_number"`
	FullName    string    `json:"full_name" db:"full_name"`
	Role        UserRole  `json:"role" db:"role"`
	IsVerified  bool      `json:"is_verified" db:"is_verified"`
	CreatedAt   time.Time `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time `json:"updated_at" db:"updated_at"`
}

type OTPLog struct {
	ID          string    `json:"id" db:"id"`
	PhoneNumber string    `json:"phone_number" db:"phone_number"`
	Code        string    `json:"code" db:"code"`
	ExpiresAt   time.Time `json:"expires_at" db:"expires_at"`
	IsUsed      bool      `json:"is_used" db:"is_used"`
	CreatedAt   time.Time `json:"created_at" db:"created_at"`
}
