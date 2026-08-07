package repository

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/google/uuid"

	"tembus/order-service/internal/domain"
)

// merchantCancellationFeeRepo — implementasi domain.MerchantCancellationFeeRepository.
type merchantCancellationFeeRepo struct {
	db     *sql.DB
	readDB *sql.DB
}

func NewMerchantCancellationFeeRepository(db, readDB *sql.DB) domain.MerchantCancellationFeeRepository {
	return &merchantCancellationFeeRepo{db: db, readDB: readDB}
}

func (r *merchantCancellationFeeRepo) Create(ctx context.Context, fee *domain.MerchantCancellationFee) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO merchant_cancellation_fees
			(id, merchant_id, order_id, amount_idr, reason, status)
		VALUES ($1, $2, $3, $4, $5, $6)
		ON CONFLICT (order_id) DO NOTHING`,
		fee.ID, fee.MerchantID, fee.OrderID, fee.AmountIDR, fee.Reason, string(fee.Status))
	if err != nil {
		return fmt.Errorf("insert merchant_cancellation_fee: %w", err)
	}
	return nil
}

func (r *merchantCancellationFeeRepo) GetOutstandingByMerchant(ctx context.Context, merchantID string) ([]*domain.MerchantCancellationFee, error) {
	rows, err := r.readDB.QueryContext(ctx, `
		SELECT id, merchant_id, order_id, amount_idr, COALESCE(reason, ''), status,
		       deducted_from_settlement_id, created_at, deducted_at
		FROM merchant_cancellation_fees
		WHERE merchant_id = $1 AND status = 'PENDING'
		ORDER BY created_at ASC`, merchantID)
	if err != nil {
		return nil, fmt.Errorf("query outstanding cancellation fees: %w", err)
	}
	defer rows.Close()

	var out []*domain.MerchantCancellationFee
	for rows.Next() {
		f := &domain.MerchantCancellationFee{}
		if err := rows.Scan(&f.ID, &f.MerchantID, &f.OrderID, &f.AmountIDR, &f.Reason,
			&f.Status, &f.DeductedFromSettlementID, &f.CreatedAt, &f.DeductedAt); err != nil {
			return nil, err
		}
		out = append(out, f)
	}
	return out, rows.Err()
}

func (r *merchantCancellationFeeRepo) MarkDeducted(ctx context.Context, id uuid.UUID, settlementID uuid.UUID) error {
	res, err := r.db.ExecContext(ctx, `
		UPDATE merchant_cancellation_fees
		SET status = 'DEDUCTED',
		    deducted_from_settlement_id = $2,
		    deducted_at = NOW()
		WHERE id = $1 AND status = 'PENDING'`, id, settlementID)
	if err != nil {
		return fmt.Errorf("mark cancellation fee deducted: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("cancellation fee %s bukan PENDING atau sudah lunas", id)
	}
	return nil
}
