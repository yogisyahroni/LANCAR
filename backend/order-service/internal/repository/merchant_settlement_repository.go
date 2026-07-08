package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"tembus/order-service/internal/domain"
)

type merchantSettlementRepository struct {
	db *sql.DB
}

// NewMerchantSettlementRepository membuat implementasi PostgreSQL untuk MerchantSettlementRepository.
func NewMerchantSettlementRepository(db *sql.DB) domain.MerchantSettlementRepository {
	return &merchantSettlementRepository{db: db}
}

func (r *merchantSettlementRepository) Create(ctx context.Context, s *domain.MerchantSettlement) error {
	metaJSON, err := json.Marshal(s.Metadata)
	if err != nil {
		return fmt.Errorf("failed to marshal metadata: %w", err)
	}

	_, err = r.db.ExecContext(ctx, `
		INSERT INTO merchant_settlements (
			id, payment_link_id, merchant_id, order_id,
			gross_item_price_idr, merchant_fee_idr, net_payout_idr,
			status, idempotency_key,
			pod_confirmed_at, holding_release_at,
			retry_count, metadata, created_by_admin_id,
			created_at, updated_at
		) VALUES (
			$1, $2, $3, $4,
			$5, $6, $7,
			$8, $9,
			$10, $11,
			$12, $13, $14,
			NOW(), NOW()
		)`,
		s.ID, s.PaymentLinkID, s.MerchantID, s.OrderID,
		s.GrossItemPriceIDR, s.MerchantFeeIDR, s.NetPayoutIDR,
		s.Status, s.IdempotencyKey,
		s.PODConfirmedAt, s.HoldingReleaseAt,
		s.RetryCount, metaJSON, s.CreatedByAdminID,
	)
	return err
}

func (r *merchantSettlementRepository) GetByID(ctx context.Context, id uuid.UUID) (*domain.MerchantSettlement, error) {
	row := r.db.QueryRowContext(ctx, `
		SELECT id, payment_link_id, merchant_id, order_id,
		       gross_item_price_idr, merchant_fee_idr, net_payout_idr,
		       status, idempotency_key,
		       pod_confirmed_at, holding_release_at, settled_at,
		       disbursement_ref, failure_reason, retry_count,
		       metadata, created_by_admin_id, created_at, updated_at
		FROM merchant_settlements
		WHERE id = $1`, id)
	return r.scanOne(row)
}

func (r *merchantSettlementRepository) GetByIdempotencyKey(ctx context.Context, key string) (*domain.MerchantSettlement, error) {
	row := r.db.QueryRowContext(ctx, `
		SELECT id, payment_link_id, merchant_id, order_id,
		       gross_item_price_idr, merchant_fee_idr, net_payout_idr,
		       status, idempotency_key,
		       pod_confirmed_at, holding_release_at, settled_at,
		       disbursement_ref, failure_reason, retry_count,
		       metadata, created_by_admin_id, created_at, updated_at
		FROM merchant_settlements
		WHERE idempotency_key = $1`, key)
	s, err := r.scanOne(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return s, err
}

// GetPendingHoldingReleased mengambil settlement HOLDING yang holding_release_at sudah lewat.
// FOR UPDATE SKIP LOCKED memastikan keamanan multi-instance: jika satu pod sedang
// memproses record ini, pod lain akan skip ke record berikutnya.
func (r *merchantSettlementRepository) GetPendingHoldingReleased(ctx context.Context, now time.Time, limit int) ([]*domain.MerchantSettlement, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, payment_link_id, merchant_id, order_id,
		       gross_item_price_idr, merchant_fee_idr, net_payout_idr,
		       status, idempotency_key,
		       pod_confirmed_at, holding_release_at, settled_at,
		       disbursement_ref, failure_reason, retry_count,
		       metadata, created_by_admin_id, created_at, updated_at
		FROM merchant_settlements
		WHERE status = 'HOLDING'
		  AND holding_release_at <= $1
		ORDER BY holding_release_at ASC
		LIMIT $2
		FOR UPDATE SKIP LOCKED`,
		now, limit)
	if err != nil {
		return nil, fmt.Errorf("GetPendingHoldingReleased query failed: %w", err)
	}
	defer rows.Close()
	return r.scanMany(rows)
}

// AtomicSetStatus mengubah status dengan UPDATE WHERE status=fromStatus RETURNING id.
// Mengembalikan (true, nil) jika berhasil, (false, nil) jika sudah diproses (idempotent).
func (r *merchantSettlementRepository) AtomicSetStatus(ctx context.Context, id uuid.UUID, fromStatus, toStatus domain.SettlementStatus) (bool, error) {
	result, err := r.db.ExecContext(ctx, `
		UPDATE merchant_settlements
		SET status = $1, updated_at = NOW()
		WHERE id = $2 AND status = $3`,
		toStatus, id, fromStatus)
	if err != nil {
		return false, fmt.Errorf("AtomicSetStatus failed: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return false, err
	}
	return affected == 1, nil
}

func (r *merchantSettlementRepository) UpdateCompleted(ctx context.Context, id uuid.UUID, disbursementRef string) error {
	now := time.Now()
	_, err := r.db.ExecContext(ctx, `
		UPDATE merchant_settlements
		SET status = 'COMPLETED',
		    disbursement_ref = $1,
		    settled_at = $2,
		    updated_at = NOW()
		WHERE id = $3`,
		disbursementRef, now, id)
	return err
}

func (r *merchantSettlementRepository) UpdateFailed(ctx context.Context, id uuid.UUID, reason string) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE merchant_settlements
		SET status = 'FAILED',
		    failure_reason = $1,
		    retry_count = retry_count + 1,
		    updated_at = NOW()
		WHERE id = $2`,
		reason, id)
	return err
}

func (r *merchantSettlementRepository) RequeueForRetry(ctx context.Context, id uuid.UUID, retryAt time.Time) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE merchant_settlements
		SET status = 'HOLDING',
		    holding_release_at = $1,
		    updated_at = NOW()
		WHERE id = $2`,
		retryAt, id)
	return err
}

func (r *merchantSettlementRepository) ListByMerchantID(ctx context.Context, merchantID string, limit, offset int) ([]*domain.MerchantSettlement, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, payment_link_id, merchant_id, order_id,
		       gross_item_price_idr, merchant_fee_idr, net_payout_idr,
		       status, idempotency_key,
		       pod_confirmed_at, holding_release_at, settled_at,
		       disbursement_ref, failure_reason, retry_count,
		       metadata, created_by_admin_id, created_at, updated_at
		FROM merchant_settlements
		WHERE merchant_id = $1
		ORDER BY created_at DESC
		LIMIT $2 OFFSET $3`,
		merchantID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return r.scanMany(rows)
}

func (r *merchantSettlementRepository) ListAll(ctx context.Context, status string, limit, offset int) ([]*domain.MerchantSettlement, error) {
	var rows *sql.Rows
	var err error
	if status == "" {
		rows, err = r.db.QueryContext(ctx, `
			SELECT id, payment_link_id, merchant_id, order_id,
			       gross_item_price_idr, merchant_fee_idr, net_payout_idr,
			       status, idempotency_key,
			       pod_confirmed_at, holding_release_at, settled_at,
			       disbursement_ref, failure_reason, retry_count,
			       metadata, created_by_admin_id, created_at, updated_at
			FROM merchant_settlements
			ORDER BY created_at DESC
			LIMIT $1 OFFSET $2`,
			limit, offset)
	} else {
		rows, err = r.db.QueryContext(ctx, `
			SELECT id, payment_link_id, merchant_id, order_id,
			       gross_item_price_idr, merchant_fee_idr, net_payout_idr,
			       status, idempotency_key,
			       pod_confirmed_at, holding_release_at, settled_at,
			       disbursement_ref, failure_reason, retry_count,
			       metadata, created_by_admin_id, created_at, updated_at
			FROM merchant_settlements
			WHERE status = $1
			ORDER BY created_at DESC
			LIMIT $2 OFFSET $3`,
			status, limit, offset)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return r.scanMany(rows)
}

func (r *merchantSettlementRepository) GetMerchantBankInfo(ctx context.Context, merchantID uuid.UUID) (*domain.MerchantBankInfo, error) {
	row := r.db.QueryRowContext(ctx, `
		SELECT id, bank_code, bank_account_number, bank_account_name, bank_verified
		FROM users
		WHERE id = $1`, merchantID)

	info := &domain.MerchantBankInfo{}
	err := row.Scan(
		&info.UserID,
		&info.BankCode,
		&info.BankAccountNumber,
		&info.BankAccountName,
		&info.BankVerified,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("merchant %s not found", merchantID)
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get merchant bank info: %w", err)
	}
	return info, nil
}

func (r *merchantSettlementRepository) GetOrderByAWB(ctx context.Context, awbNumber string) (*domain.Order, error) {
	row := r.db.QueryRowContext(ctx, `
		SELECT id, customer_id, status, awb, created_at, updated_at
		FROM orders
		WHERE awb = $1
		LIMIT 1`, awbNumber)

	o := &domain.Order{}
	err := row.Scan(&o.ID, &o.CustomerID, &o.Status, &o.AWB, &o.CreatedAt, &o.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("GetOrderByAWB failed: %w", err)
	}
	return o, nil
}

func (r *merchantSettlementRepository) GetPaymentLinkByOrderID(ctx context.Context, orderID string) (*domain.PaymentLink, error) {
	row := r.db.QueryRowContext(ctx, `
		SELECT id, merchant_id, item_price, merchant_fee_amount,
		       delivery_fee_amount, status
		FROM payment_links
		WHERE order_id = $1
		LIMIT 1`, orderID)

	pl := &domain.PaymentLink{}
	err := row.Scan(
		&pl.ID, &pl.MerchantID,
		&pl.ItemPrice, &pl.MerchantFeeAmount,
		&pl.DeliveryFeeAmount, &pl.Status,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("GetPaymentLinkByOrderID failed: %w", err)
	}
	return pl, nil
}

func (r *merchantSettlementRepository) UpdateOrderDeliveryConfirmed(ctx context.Context, orderID string, confirmedAt time.Time, podURL string) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE orders
		SET delivery_confirmed_at = $1,
		    delivery_pod_url = $2,
		    status = 'delivered',
		    updated_at = NOW()
		WHERE id = $3`,
		confirmedAt, podURL, orderID)
	return err
}

// ─── Internal scan helpers ────────────────────────────────────────────────────

func (r *merchantSettlementRepository) scanOne(row *sql.Row) (*domain.MerchantSettlement, error) {
	s := &domain.MerchantSettlement{}
	var metaRaw []byte
	var disbRef, failReason sql.NullString
	err := row.Scan(
		&s.ID, &s.PaymentLinkID, &s.MerchantID, &s.OrderID,
		&s.GrossItemPriceIDR, &s.MerchantFeeIDR, &s.NetPayoutIDR,
		&s.Status, &s.IdempotencyKey,
		&s.PODConfirmedAt, &s.HoldingReleaseAt, &s.SettledAt,
		&disbRef, &failReason, &s.RetryCount,
		&metaRaw, &s.CreatedByAdminID, &s.CreatedAt, &s.UpdatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if disbRef.Valid {
		s.DisbursementRef = disbRef.String
	}
	if failReason.Valid {
		s.FailureReason = failReason.String
	}
	if len(metaRaw) > 0 {
		_ = json.Unmarshal(metaRaw, &s.Metadata)
	}
	if s.Metadata == nil {
		s.Metadata = make(map[string]any)
	}
	return s, nil
}

func (r *merchantSettlementRepository) scanMany(rows *sql.Rows) ([]*domain.MerchantSettlement, error) {
	var results []*domain.MerchantSettlement
	for rows.Next() {
		s := &domain.MerchantSettlement{}
		var metaRaw []byte
		var disbRef, failReason sql.NullString
		err := rows.Scan(
			&s.ID, &s.PaymentLinkID, &s.MerchantID, &s.OrderID,
			&s.GrossItemPriceIDR, &s.MerchantFeeIDR, &s.NetPayoutIDR,
			&s.Status, &s.IdempotencyKey,
			&s.PODConfirmedAt, &s.HoldingReleaseAt, &s.SettledAt,
			&disbRef, &failReason, &s.RetryCount,
			&metaRaw, &s.CreatedByAdminID, &s.CreatedAt, &s.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("scanMany: %w", err)
		}
		if disbRef.Valid {
			s.DisbursementRef = disbRef.String
		}
		if failReason.Valid {
			s.FailureReason = failReason.String
		}
		if len(metaRaw) > 0 {
			_ = json.Unmarshal(metaRaw, &s.Metadata)
		}
		if s.Metadata == nil {
			s.Metadata = make(map[string]any)
		}
		results = append(results, s)
	}
	return results, rows.Err()
}
