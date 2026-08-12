package repository

import (
	"context"
	"database/sql"
	"errors"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"

	"tembus/order-service/internal/domain"
)

// PostgresVoucherRepo — FB-078: voucher redeem customer.
// Tabel vouchers & voucher_usages sudah ada (migration 00008, admin-service CRUD).
type PostgresVoucherRepo struct {
	primaryDB *sqlx.DB
	replicaDB *sqlx.DB
}

func NewPostgresVoucherRepo(primaryDB *sqlx.DB, replicaDB *sqlx.DB) *PostgresVoucherRepo {
	return &PostgresVoucherRepo{primaryDB: primaryDB, replicaDB: replicaDB}
}

func (r *PostgresVoucherRepo) GetActiveByCode(ctx context.Context, code string) (*domain.Voucher, error) {
	query := `
		SELECT id, code, name, type, value, max_discount_idr, min_order_idr,
		       quota, used_count, is_active, is_single_use,
		       COALESCE(applicable_models, ARRAY[]::text[]) AS applicable_models,
		       valid_from, valid_until, created_at, updated_at
		FROM vouchers
		WHERE code = $1 AND is_active = TRUE
	`
	var v domain.Voucher
	err := r.replicaDB.GetContext(ctx, &v, query, code)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &v, nil
}

func (r *PostgresVoucherRepo) HasUserUsed(ctx context.Context, voucherID, userID uuid.UUID) (bool, error) {
	query := `
		SELECT EXISTS(
			SELECT 1 FROM voucher_usages
			WHERE voucher_id = $1 AND user_id = $2
		)
	`
	var used bool
	err := r.replicaDB.GetContext(ctx, &used, query, voucherID, userID)
	if err != nil {
		return false, err
	}
	return used, nil
}

// ApplyUsage — catat pemakaian + increment quota dalam satu transaksi.
// Idempotent: kalau (voucher_id, order_id) sudah tercatat, tidak menambah
// used_count dobel (guard via EXISTS).
func (r *PostgresVoucherRepo) ApplyUsage(ctx context.Context, voucherID, orderID, userID uuid.UUID, discountIDR int64) error {
	tx, err := r.primaryDB.BeginTxx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	var exists bool
	err = tx.GetContext(ctx, &exists,
		`SELECT EXISTS(SELECT 1 FROM voucher_usages WHERE voucher_id = $1 AND order_id = $2)`,
		voucherID, orderID)
	if err != nil {
		return err
	}
	if exists {
		return nil // sudah tercatat — idempotent
	}

	_, err = tx.ExecContext(ctx,
		`INSERT INTO voucher_usages (voucher_id, order_id, user_id, discount_idr)
		 VALUES ($1, $2, $3, $4)`,
		voucherID, orderID, userID, discountIDR)
	if err != nil {
		return err
	}

	_, err = tx.ExecContext(ctx,
		`UPDATE vouchers SET used_count = used_count + 1, updated_at = NOW() WHERE id = $1`,
		voucherID)
	if err != nil {
		return err
	}

	return tx.Commit()
}
