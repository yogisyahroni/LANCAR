package repository

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"

	"tembus/order-service/internal/domain"
)

type PostgresPayoutRepo struct {
	db     *sqlx.DB
	readDb *sqlx.DB
}

func NewPostgresPayoutRepo(db *sqlx.DB, readDb *sqlx.DB) *PostgresPayoutRepo {
	if readDb == nil {
		readDb = db // fallback to primary if read replica is not provided
	}
	return &PostgresPayoutRepo{db: db, readDb: readDb}
}

func (r *PostgresPayoutRepo) CreatePayout(ctx context.Context, record *domain.PayoutRecord) error {
	query := `
		INSERT INTO payout_records (
			id, courier_id, order_leg_id, order_id, type, gross_idr, penalty_idr, 
			idle_compensation_idr, net_idr, pph21_idr, disbursement_status, 
			batch_date, created_at, updated_at
		) VALUES (
			:id, :courier_id, :order_leg_id, :order_id, :type, :gross_idr, :penalty_idr,
			:idle_compensation_idr, :net_idr, :pph21_idr, :disbursement_status,
			:batch_date, :created_at, :updated_at
		)
	`
	_, err := r.db.NamedExecContext(ctx, query, record)
	return err
}

func (r *PostgresPayoutRepo) UpdatePayoutStatus(ctx context.Context, id uuid.UUID, status domain.PayoutStatus, ref *string, errReason *string) error {
	query := `
		UPDATE payout_records 
		SET disbursement_status = $1, disbursement_ref = $2, failure_reason = $3, updated_at = NOW()
		WHERE id = $4
	`
	_, err := r.db.ExecContext(ctx, query, status, ref, errReason, id)
	return err
}

func (r *PostgresPayoutRepo) GetPendingPayoutsByCourier(ctx context.Context, courierID uuid.UUID) ([]domain.PayoutRecord, error) {
	query := `
		SELECT * FROM payout_records 
		WHERE courier_id = $1 AND disbursement_status = 'pending'
		ORDER BY created_at ASC
	`
	var records []domain.PayoutRecord
	err := r.readDb.SelectContext(ctx, &records, query, courierID)
	return records, err
}

func (r *PostgresPayoutRepo) GetAllPendingPayouts(ctx context.Context) ([]domain.PayoutRecord, error) {
	query := `
		SELECT * FROM payout_records 
		WHERE disbursement_status = 'pending'
		ORDER BY created_at ASC
	`
	var records []domain.PayoutRecord
	err := r.readDb.SelectContext(ctx, &records, query)
	return records, err
}

func (r *PostgresPayoutRepo) GetEarningsSummary(ctx context.Context, courierID uuid.UUID, from, to time.Time) (*domain.CourierEarningsSummary, error) {
	query := `
		SELECT 
			COALESCE(SUM(gross_idr), 0) as total_gross_idr,
			COALESCE(SUM(penalty_idr), 0) as total_penalty_idr,
			COALESCE(SUM(idle_compensation_idr), 0) as total_idle_comp_idr,
			COALESCE(SUM(net_idr), 0) as total_net_idr,
			COALESCE(SUM(pph21_idr), 0) as total_pph21_idr,
			COALESCE(SUM(net_idr - pph21_idr) FILTER (WHERE disbursement_status = 'completed'), 0) as total_payout_idr,
			COALESCE(SUM(net_idr - pph21_idr) FILTER (WHERE disbursement_status = 'pending'), 0) as pending_payout_idr
		FROM payout_records
		WHERE courier_id = $1 AND created_at >= $2 AND created_at <= $3
	`
	var summary domain.CourierEarningsSummary
	summary.CourierID = courierID

	err := r.readDb.QueryRowxContext(ctx, query, courierID, from, to).StructScan(&summary)
	if err != nil {
		return nil, err
	}

	return &summary, nil
}
