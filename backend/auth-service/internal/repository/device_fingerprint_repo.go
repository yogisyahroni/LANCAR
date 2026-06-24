package repository

import (
	"context"
	"database/sql"
	"fmt"
	"tembus/auth-service/internal/domain"
)

type DeviceFingerprintRepository struct {
	db *sql.DB
}

func NewDeviceFingerprintRepository(db *sql.DB) *DeviceFingerprintRepository {
	return &DeviceFingerprintRepository{db: db}
}

func (r *DeviceFingerprintRepository) RecordFingerprint(ctx context.Context, fp *domain.DeviceFingerprint) error {
	query := `
		INSERT INTO device_fingerprints (device_id_hash, user_id, ip_address, device_type, browser_fingerprint, risk_score, is_blocked)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id, created_at, updated_at
	`
	err := r.db.QueryRowContext(
		ctx,
		query,
		fp.DeviceIDHash,
		fp.UserID,
		fp.IPAddress,
		fp.DeviceType,
		fp.BrowserFingerprint,
		fp.RiskScore,
		fp.IsBlocked,
	).Scan(&fp.ID, &fp.CreatedAt, &fp.UpdatedAt)

	if err != nil {
		return fmt.Errorf("failed to record device fingerprint: %w", err)
	}

	return nil
}

func (r *DeviceFingerprintRepository) CountUsersByDeviceHash(ctx context.Context, deviceIDHash string) (int, error) {
	query := `
		SELECT COUNT(DISTINCT user_id)
		FROM device_fingerprints
		WHERE device_id_hash = $1
	`
	var count int
	err := r.db.QueryRowContext(ctx, query, deviceIDHash).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("failed to count users for device: %w", err)
	}
	return count, nil
}

func (r *DeviceFingerprintRepository) IsDeviceBlocked(ctx context.Context, deviceIDHash string) (bool, error) {
	query := `
		SELECT is_blocked
		FROM device_fingerprints
		WHERE device_id_hash = $1
		ORDER BY created_at DESC
		LIMIT 1
	`
	var isBlocked bool
	err := r.db.QueryRowContext(ctx, query, deviceIDHash).Scan(&isBlocked)
	if err != nil {
		if err == sql.ErrNoRows {
			return false, nil
		}
		return false, fmt.Errorf("failed to check if device is blocked: %w", err)
	}
	return isBlocked, nil
}
