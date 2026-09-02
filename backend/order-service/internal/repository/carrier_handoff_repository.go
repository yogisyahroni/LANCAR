package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"tembus/order-service/internal/domain"
	"time"
)

type carrierHandoffRepository struct{ db *sql.DB }

func NewCarrierHandoffRepository(db *sql.DB) domain.CarrierHandoffRepository {
	return &carrierHandoffRepository{db: db}
}

func (r *carrierHandoffRepository) GetAWBAttemptByOrder(ctx context.Context, orderID string) (*domain.AWBAttempt, error) {
	return r.getAttempt(ctx, `WHERE order_id = $1`, orderID)
}

func (r *carrierHandoffRepository) GetAWBAttemptByAWB(ctx context.Context, provider, awbNumber string) (*domain.AWBAttempt, error) {
	return r.getAttempt(ctx, `WHERE provider = $1 AND awb_number = $2`, provider, awbNumber)
}

func (r *carrierHandoffRepository) getAttempt(ctx context.Context, where string, args ...any) (*domain.AWBAttempt, error) {
	var a domain.AWBAttempt
	err := r.db.QueryRowContext(ctx, `
		SELECT id, order_id, idempotency_key, provider, first_mile_mode, status,
		       COALESCE(awb_number, ''), COALESCE(tracking_url, ''),
		       COALESCE(error_message, ''), created_at, updated_at
		FROM aggregator_awb_attempts `+where, args...).Scan(
		&a.ID, &a.OrderID, &a.IdempotencyKey, &a.Provider, &a.FirstMileMode, &a.Status,
		&a.AWBNumber, &a.TrackingURL, &a.ErrorMessage, &a.CreatedAt, &a.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get AWB attempt: %w", err)
	}
	return &a, nil
}

func (r *carrierHandoffRepository) CreateAWBAttempt(ctx context.Context, attempt *domain.AWBAttempt) (*domain.AWBAttempt, error) {
	if attempt.ID == "" {
		return nil, fmt.Errorf("AWB attempt id is required")
	}
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO aggregator_awb_attempts
			(id, order_id, idempotency_key, provider, first_mile_mode, status, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
		ON CONFLICT (order_id) DO NOTHING`,
		attempt.ID, attempt.OrderID, attempt.IdempotencyKey, attempt.Provider,
		attempt.FirstMileMode, domain.AWBCreationPending, attempt.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("create AWB attempt: %w", err)
	}
	return r.GetAWBAttemptByOrder(ctx, attempt.OrderID)
}

func (r *carrierHandoffRepository) MarkAWBCreated(ctx context.Context, attemptID, awbNumber, trackingURL string) error {
	if awbNumber == "" {
		return fmt.Errorf("AWB number is required")
	}
	result, err := r.db.ExecContext(ctx, `
		UPDATE aggregator_awb_attempts
		SET status = $1, awb_number = $2, tracking_url = $3, error_message = NULL, updated_at = $4
		WHERE id = $5`, domain.AWBCreationCreated, awbNumber, trackingURL, time.Now(), attemptID)
	if err != nil {
		return fmt.Errorf("mark AWB created: %w", err)
	}
	if rows, _ := result.RowsAffected(); rows != 1 {
		return fmt.Errorf("AWB attempt %s not found", attemptID)
	}
	return nil
}

func (r *carrierHandoffRepository) MarkAWBFailed(ctx context.Context, attemptID, message string) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE aggregator_awb_attempts SET status = $1, error_message = $2, updated_at = $3 WHERE id = $4`,
		domain.AWBCreationFailed, message, time.Now(), attemptID)
	if err != nil {
		return fmt.Errorf("mark AWB failed: %w", err)
	}
	return nil
}

func (r *carrierHandoffRepository) CreateCarrierHandoff(ctx context.Context, handoff *domain.CarrierHandoff) (*domain.CarrierHandoff, error) {
	if handoff.ID == "" {
		return nil, fmt.Errorf("handoff id is required")
	}
	err := r.db.QueryRowContext(ctx, `
		INSERT INTO carrier_handoffs
			(id, awb_attempt_id, order_id, provider, awb_number, first_mile_mode, status,
			 handed_off_at, location_lat, location_lng, location_address, evidence_urls,
			 actor_id, actor_type, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15,$15)
		ON CONFLICT (awb_attempt_id) DO UPDATE SET updated_at = EXCLUDED.updated_at
		RETURNING id, awb_attempt_id, order_id, provider, awb_number, first_mile_mode, status,
		          handed_off_at, location_lat, location_lng, location_address, evidence_urls,
		          actor_id, actor_type, provider_ref, provider_accepted_at, created_at, updated_at`,
		handoff.ID, handoff.AWBAttemptID, handoff.OrderID, handoff.Provider, handoff.AWBNumber,
		handoff.FirstMileMode, handoff.Status, handoff.HandedOffAt, handoff.LocationLat,
		handoff.LocationLng, handoff.LocationAddress, marshalURLs(handoff.EvidenceURLs),
		handoff.ActorID, handoff.ActorType, handoff.CreatedAt).Scan(
		&handoff.ID, &handoff.AWBAttemptID, &handoff.OrderID, &handoff.Provider, &handoff.AWBNumber,
		&handoff.FirstMileMode, &handoff.Status, &handoff.HandedOffAt, &handoff.LocationLat,
		&handoff.LocationLng, &handoff.LocationAddress, (*jsonRawMessage)(&handoff.EvidenceURLs),
		&handoff.ActorID, &handoff.ActorType, &handoff.ProviderRef, &handoff.ProviderAt,
		&handoff.CreatedAt, &handoff.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("create carrier handoff: %w", err)
	}
	return handoff, nil
}

func (r *carrierHandoffRepository) MarkCarrierAccepted(ctx context.Context, attemptID, providerRef string, acceptedAt time.Time) error {
	result, err := r.db.ExecContext(ctx, `
		UPDATE carrier_handoffs
		SET status = $1, provider_ref = $2, provider_accepted_at = $3, updated_at = NOW()
		WHERE awb_attempt_id = $4`, domain.CarrierHandoffAccepted, providerRef, acceptedAt, attemptID)
	if err != nil {
		return fmt.Errorf("mark carrier accepted: %w", err)
	}
	if rows, _ := result.RowsAffected(); rows != 1 {
		return fmt.Errorf("%w: attempt %s", domain.ErrCarrierHandoffNotFound, attemptID)
	}
	return nil
}

func marshalURLs(urls []string) string {
	if len(urls) == 0 {
		return "[]"
	}
	b, _ := json.Marshal(urls)
	return string(b)
}

// jsonRawMessage lets database/sql scan jsonb without leaking raw bytes into the domain.
type jsonRawMessage []string

func (m *jsonRawMessage) Scan(value any) error {
	if value == nil {
		*m = nil
		return nil
	}
	var raw []byte
	switch v := value.(type) {
	case []byte:
		raw = v
	case string:
		raw = []byte(v)
	default:
		return fmt.Errorf("unsupported evidence_urls value %T", value)
	}
	return json.Unmarshal(raw, (*[]string)(m))
}
