package repository

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"time"

	"github.com/jmoiron/sqlx"
	"tembus/order-service/internal/domain"
)

type PostgresPaymentRepo struct {
	db *sqlx.DB
}

func sha256Hex(value []byte) string {
	sum := sha256.Sum256(value)
	return hex.EncodeToString(sum[:])
}

func (r *PostgresPaymentRepo) InsertWebhookAuditEvent(
	ctx context.Context,
	providerName string,
	providerEventID string,
	providerReference string,
	eventType string,
	payload []byte,
	signature string,
	verificationStatus string,
	processingStatus string,
	errorCode *string,
) (string, bool, error) {
	query := `
		INSERT INTO webhook_audit_events (
			provider_name,
			provider_event_id,
			provider_reference,
			event_type,
			payload_hash,
			signature_hash,
			verification_status,
			processing_status,
			raw_payload,
			error_code
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
		ON CONFLICT (provider_name, provider_event_id) WHERE provider_event_id IS NOT NULL AND verification_status = 'valid'
		DO NOTHING
		RETURNING id`

	var id string
	err := r.db.QueryRowContext(
		ctx,
		query,
		providerName,
		nullIfEmpty(providerEventID),
		nullIfEmpty(providerReference),
		nullIfEmpty(eventType),
		sha256Hex(payload),
		nullIfEmpty(sha256Hex([]byte(signature))),
		verificationStatus,
		processingStatus,
		string(payload),
		errorCode,
	).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		return "", true, nil
	}
	if err != nil {
		return "", false, err
	}
	return id, false, nil
}

func (r *PostgresPaymentRepo) UpdateWebhookAuditEvent(ctx context.Context, id string, processingStatus string, errorCode *string) error {
	if id == "" {
		return nil
	}
	_, err := r.db.ExecContext(
		ctx,
		`UPDATE webhook_audit_events
		 SET processing_status = $2,
		     processed_at = CASE WHEN $2 IN ('processed', 'ignored', 'duplicate', 'failed') THEN NOW() ELSE processed_at END,
		     error_code = COALESCE($3, error_code)
		 WHERE id = $1`,
		id,
		processingStatus,
		errorCode,
	)
	return err
}

func nullIfEmpty(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}

func NewPostgresPaymentRepo(db *sqlx.DB) *PostgresPaymentRepo {
	return &PostgresPaymentRepo{db: db}
}

func (r *PostgresPaymentRepo) Create(ctx context.Context, p *domain.Payment) error {
	query := `
		INSERT INTO payments (
			id, order_id, payment_number, provider, method, status,
			amount_idr, mdr_amount_idr, ppn_amount_idr, weather_reserve_idr,
			insurance_reserve_idr, net_operational_idr, provider_reference,
			qr_code_url, qr_code_string, expires_at, created_at, updated_at,
			tax_rule_code, ppn_rate_effective_pct, ppn_rate_statutory_pct, dpp_idr,
			tax_invoice_required, tax_invoice_status
		) VALUES (
			:id, :order_id, :payment_number, :provider, :method, :status,
			:amount_idr, :mdr_amount_idr, :ppn_amount_idr, :weather_reserve_idr,
			:insurance_reserve_idr, :net_operational_idr, :provider_reference,
			:qr_code_url, :qr_code_string, :expires_at, :created_at, :updated_at,
			:tax_rule_code, :ppn_rate_effective_pct, :ppn_rate_statutory_pct, :dpp_idr,
			:tax_invoice_required, :tax_invoice_status
		)
	`
	_, err := r.db.NamedExecContext(ctx, query, p)
	if err != nil {
		return err
	}
	return nil
}

func (r *PostgresPaymentRepo) GetByID(ctx context.Context, id string) (*domain.Payment, error) {
	var p domain.Payment
	err := r.db.GetContext(ctx, &p, "SELECT * FROM payments WHERE id = $1", id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	return &p, nil
}

func (r *PostgresPaymentRepo) GetByOrderID(ctx context.Context, orderID string) (*domain.Payment, error) {
	var p domain.Payment
	err := r.db.GetContext(ctx, &p, "SELECT * FROM payments WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1", orderID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	return &p, nil
}

func (r *PostgresPaymentRepo) GetByPaymentNumber(ctx context.Context, paymentNumber string) (*domain.Payment, error) {
	var p domain.Payment
	err := r.db.GetContext(ctx, &p, "SELECT * FROM payments WHERE payment_number = $1", paymentNumber)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	return &p, nil
}

func (r *PostgresPaymentRepo) UpdateStatus(ctx context.Context, id string, status domain.PaymentStatus, paidAt *time.Time, providerRef *string, webhookPayload []byte) error {
	query := `
		UPDATE payments
		SET status = $1, paid_at = $2, provider_reference = COALESCE($3, provider_reference), webhook_payload = $4, updated_at = $5
		WHERE id = $6
	`
	res, err := r.db.ExecContext(ctx, query, status, paidAt, providerRef, webhookPayload, time.Now(), id)
	if err != nil {
		return err
	}

	rowsAffected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		return domain.ErrNotFound
	}

	return nil
}
