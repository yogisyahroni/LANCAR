package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"
)

type roadsideWithholdingSnapshot struct {
	ConfigKey       string    `json:"config_key"`
	RatePct         float64   `json:"rate_pct"`
	HasNPWP         bool      `json:"has_npwp"`
	ConfigUpdatedAt time.Time `json:"config_updated_at"`
}

// The user row protects a missing tax profile from concurrent insertion;
// existing profiles and the selected rate are locked for the whole settlement.
func loadRoadsideWithholdingSnapshot(ctx context.Context, tx *sql.Tx, courierID string) (roadsideWithholdingSnapshot, error) {
	var snapshot roadsideWithholdingSnapshot
	var userID string
	if err := tx.QueryRowContext(ctx, `SELECT id::text FROM users WHERE id=$1 FOR UPDATE`, courierID).Scan(&userID); err != nil {
		return snapshot, fmt.Errorf("lock courier tax identity: %w", err)
	}
	var npwp sql.NullString
	err := tx.QueryRowContext(ctx, `SELECT npwp FROM user_tax_profiles WHERE user_id=$1 FOR SHARE`, courierID).Scan(&npwp)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return snapshot, fmt.Errorf("read courier tax profile: %w", err)
	}
	snapshot.HasNPWP = npwp.Valid && strings.TrimSpace(npwp.String) != ""
	snapshot.ConfigKey = "PPH21_COURIER_RATE_NON_NPWP"
	if snapshot.HasNPWP {
		snapshot.ConfigKey = "PPH21_COURIER_RATE_NPWP"
	}
	var raw []byte
	if err := tx.QueryRowContext(ctx, `SELECT value,updated_at FROM system_configs WHERE key=$1 FOR SHARE`, snapshot.ConfigKey).Scan(&raw, &snapshot.ConfigUpdatedAt); err != nil {
		return snapshot, fmt.Errorf("read authoritative withholding rate: %w", err)
	}
	if err := json.Unmarshal(raw, &snapshot.RatePct); err != nil || math.IsNaN(snapshot.RatePct) || math.IsInf(snapshot.RatePct, 0) || snapshot.RatePct < 0 || snapshot.RatePct > 100 {
		return snapshot, fmt.Errorf("invalid authoritative withholding rate")
	}
	return snapshot, nil
}
