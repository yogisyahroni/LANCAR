package domain

import (
	"context"
	"time"
)

type DeviceFingerprint struct {
	ID                 string    `json:"id" db:"id"`
	DeviceIDHash       string    `json:"device_id_hash" db:"device_id_hash"`
	UserID             string    `json:"user_id" db:"user_id"`
	IPAddress          string    `json:"ip_address" db:"ip_address"`
	DeviceType         string    `json:"device_type" db:"device_type"`
	BrowserFingerprint *string   `json:"browser_fingerprint,omitempty" db:"browser_fingerprint"`
	RiskScore          int       `json:"risk_score" db:"risk_score"`
	IsBlocked          bool      `json:"is_blocked" db:"is_blocked"`
	CreatedAt          time.Time `json:"created_at" db:"created_at"`
	UpdatedAt          time.Time `json:"updated_at" db:"updated_at"`
}

type DeviceFingerprintRepository interface {
	RecordFingerprint(ctx context.Context, fp *DeviceFingerprint) error
	CountUsersByDeviceHash(ctx context.Context, deviceIDHash string) (int, error)
	IsDeviceBlocked(ctx context.Context, deviceIDHash string) (bool, error)
}
