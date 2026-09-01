package repository

import (
	"context"
	"database/sql"
	"fmt"
	"tembus/order-service/internal/domain"
)

type carrierEventRepository struct{ db *sql.DB }

func NewCarrierEventRepository(db *sql.DB) domain.CarrierEventRepository {
	return &carrierEventRepository{db: db}
}

func (r *carrierEventRepository) InsertIfNew(ctx context.Context, event *domain.CarrierEvent) (bool, error) {
	result, err := r.db.ExecContext(ctx, `
		INSERT INTO carrier_event_inbox
			(id, provider, event_id, payload_hash, awb_number, canonical_status, raw_status,
			 raw_code, raw_description, raw_location, occurred_at, received_at, raw_payload)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
		ON CONFLICT DO NOTHING`,
		event.ID, event.Provider, event.EventID, event.PayloadHash, event.AWBNumber,
		event.CanonicalStatus, event.RawStatus, event.RawCode, event.RawDescription,
		event.RawLocation, event.OccurredAt, event.ReceivedAt, event.RawPayload)
	if err != nil {
		return false, fmt.Errorf("insert carrier event inbox: %w", err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return false, fmt.Errorf("carrier event rows affected: %w", err)
	}
	return rows == 1, nil
}
