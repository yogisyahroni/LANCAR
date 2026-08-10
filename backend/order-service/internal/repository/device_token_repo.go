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

func (r *deviceTokenRepo) GetDeviceTokensByUserIDs(ctx context.Context, userIDs []uuid.UUID) (map[uuid.UUID][]string, error) {
	if len(userIDs) == 0 {
		return map[uuid.UUID][]string{}, nil
	}

	query := `
		SELECT user_id, token
		FROM user_device_tokens
		WHERE user_id = ANY($1)`
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
