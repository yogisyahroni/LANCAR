package repository

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/jmoiron/sqlx"
	"lancar/order-service/internal/domain"
)

type PostgresPaymentRepo struct {
	db *sqlx.DB
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
			qr_code_url, qr_code_string, expires_at, created_at, updated_at
		) VALUES (
			:id, :order_id, :payment_number, :provider, :method, :status,
			:amount_idr, :mdr_amount_idr, :ppn_amount_idr, :weather_reserve_idr,
			:insurance_reserve_idr, :net_operational_idr, :provider_reference,
			:qr_code_url, :qr_code_string, :expires_at, :created_at, :updated_at
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
