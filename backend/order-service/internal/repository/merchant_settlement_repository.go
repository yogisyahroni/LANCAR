package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
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

	// Food order (FOOD-BIKE-067) tidak punya payment link — insert NULL,
	// bukan string kosong (agar tidak melanggar FK payment_links).
	var paymentLinkIDArg any
	if s.PaymentLinkID == "" {
		paymentLinkIDArg = nil
	} else {
		paymentLinkIDArg = s.PaymentLinkID
	}

	_, err = r.db.ExecContext(ctx, `
		INSERT INTO merchant_settlements (
			id, payment_link_id, merchant_id, order_id,
			gross_item_price_idr, merchant_fee_idr, disbursement_fee_idr,
			merchant_promo_discount_idr, net_payout_idr,
			status, idempotency_key,
			pod_confirmed_at, holding_release_at,
			retry_count, metadata, created_by_admin_id,
			created_at, updated_at
		) VALUES (
			$1, $2, $3, $4,
			$5, $6, $7,
			$8, $9,
			$10, $11,
			$12, $13,
			$14, $15, $16,
			NOW(), NOW()
		) ON CONFLICT (idempotency_key) DO NOTHING`,
		s.ID, paymentLinkIDArg, s.MerchantID, s.OrderID,
		s.GrossItemPriceIDR, s.MerchantFeeIDR, s.DisbursementFeeIDR,
		s.MerchantPromoDiscountIDR, s.NetPayoutIDR,
		s.Status, s.IdempotencyKey,
		s.PODConfirmedAt, s.HoldingReleaseAt,
		s.RetryCount, metaJSON, s.CreatedByAdminID,
	)
	return err
}

func (r *merchantSettlementRepository) GetByID(ctx context.Context, id uuid.UUID) (*domain.MerchantSettlement, error) {
	row := r.db.QueryRowContext(ctx, `
		SELECT id, payment_link_id, merchant_id, order_id,
		       gross_item_price_idr, merchant_fee_idr, disbursement_fee_idr,
		       merchant_promo_discount_idr, net_payout_idr,
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
		       gross_item_price_idr, merchant_fee_idr, disbursement_fee_idr,
		       merchant_promo_discount_idr, net_payout_idr,
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
		       gross_item_price_idr, merchant_fee_idr, disbursement_fee_idr,
		       merchant_promo_discount_idr, net_payout_idr,
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
		       gross_item_price_idr, merchant_fee_idr, disbursement_fee_idr,
		       merchant_promo_discount_idr, net_payout_idr,
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
			       gross_item_price_idr, merchant_fee_idr, disbursement_fee_idr,
		       merchant_promo_discount_idr, net_payout_idr,
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
			       gross_item_price_idr, merchant_fee_idr, disbursement_fee_idr,
		       merchant_promo_discount_idr, net_payout_idr,
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

// GetFoodOrderForSettlement — ambil data order food untuk settlement escrow
// (FOOD-BIKE-067). Gross = SUM(food_order_items.subtotal); hanya order dengan
// service_sub_type = 'food_delivery' & merchant_id terisi. Return nil jika
// bukan order food.
func (r *merchantSettlementRepository) GetFoodOrderForSettlement(ctx context.Context, orderID string) (*domain.FoodOrderSettlementData, error) {
	row := r.db.QueryRowContext(ctx, `
		SELECT o.id,
		       COALESCE(o.merchant_id::text, ''),
		       COALESCE(o.platform_fee_idr, 0),
		       COALESCE(SUM(f.subtotal), 0)
		FROM orders o
		LEFT JOIN food_order_items f ON f.order_id = o.id
		WHERE o.id = $1
		  AND o.service_sub_type = 'food_delivery'
		  AND o.merchant_id IS NOT NULL
		GROUP BY o.id, o.merchant_id, o.platform_fee_idr`, orderID)

	var d domain.FoodOrderSettlementData
	err := row.Scan(&d.OrderID, &d.MerchantID, &d.PlatformFeeIDR, &d.GrossItemIDR)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("GetFoodOrderForSettlement failed: %w", err)
	}
	if d.MerchantID == "" {
		return nil, nil
	}
	return &d, nil
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

// ListFoodOrderItemsForPromo — FB-101: item order food untuk kalkulasi
// potongan promo merchant (menu_item_id, harga satuan, qty, subtotal).
func (r *merchantSettlementRepository) ListFoodOrderItemsForPromo(ctx context.Context, orderID string) ([]domain.FoodOrderItemForPromo, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT menu_item_id::text, item_price, quantity, subtotal
		FROM food_order_items
		WHERE order_id = $1
		ORDER BY created_at`, orderID)
	if err != nil {
		return nil, fmt.Errorf("ListFoodOrderItemsForPromo failed: %w", err)
	}
	defer rows.Close()

	out := []domain.FoodOrderItemForPromo{}
	for rows.Next() {
		var it domain.FoodOrderItemForPromo
		if err := rows.Scan(&it.MenuItemID, &it.ItemPrice, &it.Quantity, &it.Subtotal); err != nil {
			return nil, fmt.Errorf("ListFoodOrderItemsForPromo scan failed: %w", err)
		}
		out = append(out, it)
	}
	return out, rows.Err()
}

// ListActiveMerchantPromos — FB-101: promo merchant aktif pada saat ini
// (is_active + window waktu) untuk potongan payout settlement.
func (r *merchantSettlementRepository) ListActiveMerchantPromos(ctx context.Context, merchantID string, now time.Time) ([]domain.ActiveMerchantPromo, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT menu_item_id::text, discount_type, discount_value, max_discount_idr
		FROM merchant_promos
		WHERE merchant_id = $1
		  AND is_active = TRUE
		  AND starts_at <= $2
		  AND ends_at > $2`,
		merchantID, now)
	if err != nil {
		return nil, fmt.Errorf("ListActiveMerchantPromos failed: %w", err)
	}
	defer rows.Close()

	out := []domain.ActiveMerchantPromo{}
	for rows.Next() {
		var p domain.ActiveMerchantPromo
		var menuItemID, maxDiscount sql.NullString
		if err := rows.Scan(&menuItemID, &p.DiscountType, &p.DiscountValue, &maxDiscount); err != nil {
			return nil, fmt.Errorf("ListActiveMerchantPromos scan failed: %w", err)
		}
		if menuItemID.Valid && menuItemID.String != "" {
			v := menuItemID.String
			p.MenuItemID = &v
		}
		if maxDiscount.Valid && maxDiscount.String != "" {
			v, err := strconv.ParseInt(maxDiscount.String, 10, 64)
			if err == nil {
				p.MaxDiscountIDR = &v
			}
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// ─── Internal scan helpers ────────────────────────────────────────────────────

func (r *merchantSettlementRepository) scanOne(row *sql.Row) (*domain.MerchantSettlement, error) {
	s := &domain.MerchantSettlement{}
	var metaRaw []byte
	var disbRef, failReason, paymentLinkID sql.NullString
	var podConfirmedAt, holdingReleaseAt, settledAt sql.NullTime
	err := row.Scan(
		&s.ID, &paymentLinkID, &s.MerchantID, &s.OrderID,
		&s.GrossItemPriceIDR, &s.MerchantFeeIDR, &s.DisbursementFeeIDR,
		&s.MerchantPromoDiscountIDR, &s.NetPayoutIDR,
		&s.Status, &s.IdempotencyKey,
		&podConfirmedAt, &holdingReleaseAt, &settledAt,
		&disbRef, &failReason, &s.RetryCount,
		&metaRaw, &s.CreatedByAdminID, &s.CreatedAt, &s.UpdatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if paymentLinkID.Valid {
		s.PaymentLinkID = paymentLinkID.String
	}
	if podConfirmedAt.Valid {
		s.PODConfirmedAt = &podConfirmedAt.Time
	}
	if holdingReleaseAt.Valid {
		s.HoldingReleaseAt = &holdingReleaseAt.Time
	}
	if settledAt.Valid {
		s.SettledAt = &settledAt.Time
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
		var disbRef, failReason, paymentLinkID sql.NullString
		var podConfirmedAt, holdingReleaseAt, settledAt sql.NullTime
		err := rows.Scan(
			&s.ID, &paymentLinkID, &s.MerchantID, &s.OrderID,
			&s.GrossItemPriceIDR, &s.MerchantFeeIDR, &s.DisbursementFeeIDR,
			&s.MerchantPromoDiscountIDR, &s.NetPayoutIDR,
			&s.Status, &s.IdempotencyKey,
			&podConfirmedAt, &holdingReleaseAt, &settledAt,
			&disbRef, &failReason, &s.RetryCount,
			&metaRaw, &s.CreatedByAdminID, &s.CreatedAt, &s.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("scanMany: %w", err)
		}
		if paymentLinkID.Valid {
			s.PaymentLinkID = paymentLinkID.String
		}
		if podConfirmedAt.Valid {
			s.PODConfirmedAt = &podConfirmedAt.Time
		}
		if holdingReleaseAt.Valid {
			s.HoldingReleaseAt = &holdingReleaseAt.Time
		}
		if settledAt.Valid {
			s.SettledAt = &settledAt.Time
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
