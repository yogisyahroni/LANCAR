package repository

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"

	"tembus/order-service/internal/domain"
)

// PostgresTipRepo — FB-077: driver_tips.
type PostgresTipRepo struct {
	primaryDB *sqlx.DB
	replicaDB *sqlx.DB
}

func NewPostgresTipRepo(primaryDB *sqlx.DB, replicaDB *sqlx.DB) *PostgresTipRepo {
	return &PostgresTipRepo{primaryDB: primaryDB, replicaDB: replicaDB}
}

func (r *PostgresTipRepo) CreateTip(ctx context.Context, tip *domain.DriverTip) error {
	query := `
		INSERT INTO driver_tips (order_id, customer_id, courier_id, amount_idr, service_sub_type, status, payment_ref)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id, created_at, updated_at
	`
	err := r.primaryDB.QueryRowxContext(ctx, query,
		tip.OrderID, tip.CustomerID, tip.CourierID, tip.AmountIDR, tip.ServiceSubType, tip.Status, tip.PaymentRef,
	).Scan(&tip.ID, &tip.CreatedAt, &tip.UpdatedAt)
	if err != nil {
		return err
	}
	return nil
}

func (r *PostgresTipRepo) GetTipByOrderID(ctx context.Context, orderID uuid.UUID) (*domain.DriverTip, error) {
	query := `
		SELECT id, order_id, customer_id, courier_id, amount_idr, service_sub_type, status, payment_ref, created_at, updated_at
		FROM driver_tips
		WHERE order_id = $1
	`
	var tip domain.DriverTip
	err := r.replicaDB.GetContext(ctx, &tip, query, orderID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &tip, nil
}

func (r *PostgresTipRepo) ListTipsByCourier(ctx context.Context, courierID uuid.UUID, limit, offset int) ([]domain.DriverTip, error) {
	query := `
		SELECT id, order_id, customer_id, courier_id, amount_idr, service_sub_type, status, payment_ref, created_at, updated_at
		FROM driver_tips
		WHERE courier_id = $1
		ORDER BY created_at DESC
		LIMIT $2 OFFSET $3
	`
	var tips []domain.DriverTip
	err := r.replicaDB.SelectContext(ctx, &tips, query, courierID, limit, offset)
	if err != nil {
		return nil, err
	}
	return tips, nil
}

func (r *PostgresTipRepo) SumTipsByCourier(ctx context.Context, courierID uuid.UUID) (int64, int, error) {
	query := `
		SELECT COALESCE(SUM(amount_idr), 0), COUNT(*)
		FROM driver_tips
		WHERE courier_id = $1 AND status = 'paid'
	`
	var total int64
	var count int
	err := r.replicaDB.QueryRowxContext(ctx, query, courierID).Scan(&total, &count)
	if err != nil {
		return 0, 0, err
	}
	return total, count, nil
}

func (r *PostgresTipRepo) SumTipsByCourierSince(ctx context.Context, courierID uuid.UUID, since time.Time) (int64, int, error) {
	query := `
		SELECT COALESCE(SUM(amount_idr), 0), COUNT(*)
		FROM driver_tips
		WHERE courier_id = $1 AND status = 'paid' AND created_at >= $2
	`
	var total int64
	var count int
	err := r.replicaDB.QueryRowxContext(ctx, query, courierID, since).Scan(&total, &count)
	if err != nil {
		return 0, 0, err
	}
	return total, count, nil
}
