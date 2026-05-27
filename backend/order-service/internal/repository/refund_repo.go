package repository

import (
	"context"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"

	"tembus/order-service/internal/domain"
)

type PostgresRefundRepo struct {
	db     *sqlx.DB
	readDb *sqlx.DB
}

func NewPostgresRefundRepo(db *sqlx.DB, readDb *sqlx.DB) *PostgresRefundRepo {
	if readDb == nil {
		readDb = db // fallback to primary if read replica is not provided
	}
	return &PostgresRefundRepo{db: db, readDb: readDb}
}

func (r *PostgresRefundRepo) CreateRefund(ctx context.Context, record *domain.RefundRecord) error {
	query := `
		INSERT INTO refunds (
			id, order_id, amount_idr, reason, status, created_at, updated_at
		) VALUES (
			:id, :order_id, :amount_idr, :reason, :status, :created_at, :updated_at
		)
	`
	_, err := r.db.NamedExecContext(ctx, query, record)
	return err
}

func (r *PostgresRefundRepo) UpdateRefundStatus(ctx context.Context, id uuid.UUID, status domain.RefundStatus, ref *string, errReason *string) error {
	query := `
		UPDATE refunds 
		SET status = $1, gateway_ref = $2, failure_reason = $3, updated_at = NOW()
		WHERE id = $4
	`
	_, err := r.db.ExecContext(ctx, query, status, ref, errReason, id)
	return err
}

func (r *PostgresRefundRepo) GetRefundsByOrder(ctx context.Context, orderID uuid.UUID) ([]domain.RefundRecord, error) {
	query := `
		SELECT * FROM refunds 
		WHERE order_id = $1
		ORDER BY created_at ASC
	`
	var records []domain.RefundRecord
	err := r.readDb.SelectContext(ctx, &records, query, orderID)
	return records, err
}

func (r *PostgresRefundRepo) GetPendingRefunds(ctx context.Context) ([]domain.RefundRecord, error) {
	query := `
		SELECT * FROM refunds 
		WHERE status = 'pending'
		ORDER BY created_at ASC
	`
	var records []domain.RefundRecord
	err := r.readDb.SelectContext(ctx, &records, query)
	return records, err
}
