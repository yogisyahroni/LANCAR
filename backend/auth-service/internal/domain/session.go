package domain

import "time"

type Session struct {
	ID           string    `json:"id" db:"id"`
	UserID       string    `json:"user_id" db:"user_id"`
	RefreshToken string    `json:"refresh_token" db:"refresh_token"`
	DeviceID     string    `json:"device_id" db:"device_id"`
	DeviceInfo   []byte    `json:"device_info" db:"device_info"` // JSONB
	IsRevoked    bool      `json:"is_revoked" db:"is_revoked"`
	ExpiresAt    time.Time `json:"expires_at" db:"expires_at"`
	CreatedAt    time.Time `json:"created_at" db:"created_at"`
	UpdatedAt    time.Time `json:"updated_at" db:"updated_at"`
}
