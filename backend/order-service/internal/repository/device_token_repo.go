package repository

import (
	"context"
	"database/sql"
	"fmt"

	"tembus/order-service/internal/domain"

	"github.com/google/uuid"
)

// deviceTokenRepo — implementasi domain.DeviceTokenRepository
// (FOOD-BIKE-064). Tabel user_device_tokens (migration 20260806000011).
type deviceTokenRepo struct {
	db     *sql.DB
	readDB *sql.DB
}

func NewDeviceTokenRepository(db, readDB *sql.DB) domain.DeviceTokenRepository {
	return &deviceTokenRepo{db: db, readDB: readDB}
}

func (r *deviceTokenRepo) UpsertDeviceToken(ctx context.Context, userID uuid.UUID, token, platform, appName string) error {
	_, err := r.db.ExecContext(ctx,
		`INSERT INTO user_device_tokens (user_id, token, platform, app_name)
		 VALUES ($1, $2, $3, $4)
		 ON CONFLICT (user_id, token)
		 DO UPDATE SET platform = EXCLUDED.platform, app_name = EXCLUDED.app_name, updated_at = NOW()`,
		userID, token, platform, appName,
	)
	return err
}

// CommunicationDeviceTokenLifecycle is intentionally additive to the legacy
// interface so existing order push callers remain source-compatible while the
// platform gains account/device/surface ownership and logout revocation.
func (r *deviceTokenRepo) RegisterDeviceToken(ctx context.Context, userID uuid.UUID, token, platform, appName, deviceID, surface, appVersion string) error {
	if deviceID == "" {
		deviceID = token
	}
	if surface == "" {
		surface = "default"
	}
	_, err := r.db.ExecContext(ctx, `
		UPDATE user_device_tokens SET invalid_at = NOW(), invalid_reason = 'account_switched', updated_at = NOW()
		WHERE device_id = $1 AND user_id <> $2 AND invalid_at IS NULL`, deviceID, userID)
	if err != nil {
		return err
	}
	_, err = r.db.ExecContext(ctx, `
		INSERT INTO user_device_tokens (user_id, token, platform, app_name, device_id, surface, app_version, last_seen_at, invalid_at, invalid_reason)
		VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NULL,NULL)
		ON CONFLICT (user_id, token) DO UPDATE SET platform=EXCLUDED.platform, app_name=EXCLUDED.app_name,
		device_id=EXCLUDED.device_id, surface=EXCLUDED.surface, app_version=EXCLUDED.app_version,
		last_seen_at=NOW(), invalid_at=NULL, invalid_reason=NULL, updated_at=NOW()`,
		userID, token, platform, appName, deviceID, surface, appVersion)
	return err
}

func (r *deviceTokenRepo) RetireDeviceToken(ctx context.Context, userID uuid.UUID, token, reason string) error {
	_, err := r.db.ExecContext(ctx, `UPDATE user_device_tokens SET invalid_at=NOW(), invalid_reason=$1, updated_at=NOW() WHERE user_id=$2 AND token=$3`, reason, userID, token)
	return err
}

func (r *deviceTokenRepo) MarkInvalidToken(ctx context.Context, token, reason string) error {
	_, err := r.db.ExecContext(ctx, `UPDATE user_device_tokens SET invalid_at=NOW(), invalid_reason=$1, updated_at=NOW() WHERE token=$2`, reason, token)
	return err
}

func (r *deviceTokenRepo) GetDeviceTokensByUserIDs(ctx context.Context, userIDs []uuid.UUID) (map[uuid.UUID][]string, error) {
	if len(userIDs) == 0 {
		return map[uuid.UUID][]string{}, nil
	}

	query := `
		SELECT user_id, token
		FROM user_device_tokens
		WHERE user_id = ANY($1) AND invalid_at IS NULL`
	rows, err := r.readDB.QueryContext(ctx, query, userIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[uuid.UUID][]string, len(userIDs))
	for rows.Next() {
		var userID uuid.UUID
		var token string
		if err := rows.Scan(&userID, &token); err != nil {
			return nil, err
		}
		result[userID] = append(result[userID], token)
	}
	return result, rows.Err()
}

func (r *deviceTokenRepo) GetMerchantOwnerUserID(ctx context.Context, merchantID string) (uuid.UUID, error) {
	mid, err := uuid.Parse(merchantID)
	if err != nil {
		return uuid.Nil, fmt.Errorf("invalid merchant id: %w", err)
	}

	var ownerID uuid.UUID
	err = r.readDB.QueryRowContext(ctx,
		`SELECT user_id FROM merchants WHERE id = $1`,
		mid,
	).Scan(&ownerID)
	if err != nil {
		return uuid.Nil, fmt.Errorf("merchant not found: %w", err)
	}
	return ownerID, nil
}
