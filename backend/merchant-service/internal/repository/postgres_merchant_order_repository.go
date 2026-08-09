package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"tembus/merchant-service/internal/domain"
	"tembus/merchant-service/internal/util"
)

// postgresMerchantOrderRepository — implementasi domain.MerchantOrderRepository.
// Akses tabel orders + food_order_items langsung di DB bersama (tembus).
type postgresMerchantOrderRepository struct {
	db     *sql.DB
	readDB *sql.DB
}

func NewPostgresMerchantOrderRepository(db, readDB *sql.DB) domain.MerchantOrderRepository {
	return &postgresMerchantOrderRepository{db: db, readDB: readDB}
}

func (r *postgresMerchantOrderRepository) AcceptOrder(ctx context.Context, merchantID, orderID string) error {
	res, err := r.db.ExecContext(ctx, `
		UPDATE orders
		SET status = 'preparing',
			merchant_accepted_at = NOW(),
			food_ready_at = NOW() + (COALESCE(prep_time_minutes, 15) * INTERVAL '1 minute'),
			updated_at = NOW()
		WHERE id = $1 AND merchant_id = $2
		  AND status = 'pending_merchant'
		  AND service_sub_type = 'food_delivery'`, orderID, merchantID)
	if err != nil {
		return fmt.Errorf("accept order: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		// Order tidak ditemukan, bukan milik merchant, atau status bukan pending_merchant
		return errors.New("order tidak ditemukan atau bukan milik merchant / tidak dalam status pending_merchant")
	}
	return nil
}

func (r *postgresMerchantOrderRepository) RejectOrder(ctx context.Context, merchantID, orderID, reason, rejectReason string) error {
	var cancelReason sql.NullString
	if reason != "" {
		cancelReason = sql.NullString{String: reason, Valid: true}
	}
	// FB-122: reject_reason enum (analitik); nullable kalau merchant legacy.
	var rejectReasonCode sql.NullString
	if rejectReason != "" {
		rejectReasonCode = sql.NullString{String: rejectReason, Valid: true}
	}
	res, err := r.db.ExecContext(ctx, `
		UPDATE orders
		SET status = 'cancelled',
			cancellation_reason = COALESCE($3, cancellation_reason),
			reject_reason = COALESCE($4, reject_reason),
			cancelled_at = NOW(),
			updated_at = NOW()
		WHERE id = $1 AND merchant_id = $2
		  AND status = 'pending_merchant'
		  AND service_sub_type = 'food_delivery'`, orderID, merchantID, cancelReason, rejectReasonCode)
	if err != nil {
		return fmt.Errorf("reject order: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return errors.New("order tidak ditemukan atau bukan milik merchant / tidak dalam status pending_merchant")
	}
	return nil
}

// RecordOrderEvent (FB-081) — insert order_events dengan user_id = customer
// order (konsisten dgn pola admin-service). Dipakai saat merchant reject
// supaya customer/tracking dapat jejak pembatalan.
func (r *postgresMerchantOrderRepository) RecordOrderEvent(ctx context.Context, orderID, eventType, description string) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO order_events (order_id, user_id, event_type, description, metadata)
		SELECT o.id, o.customer_id, $2, $3, jsonb_build_object('source', 'merchant-service')
		FROM orders o
		WHERE o.id = $1`, orderID, eventType, description)
	if err != nil {
		return fmt.Errorf("record order event: %w", err)
	}
	return nil
}

func (r *postgresMerchantOrderRepository) ListByMerchant(ctx context.Context, merchantID, status string, limit, offset int) ([]*domain.MerchantOrderView, error) {
	query := `
		SELECT o.id, o.order_number, o.status,
		       COALESCE(c.full_name, '') AS customer_name,
		       COALESCE(c.phone, '') AS customer_phone,
		       COALESCE(o.dropoff_address, '') AS dropoff_address,
		       COALESCE(o.total_price_idr, 0),
		       COALESCE(o.distance_km, 0),
		       COALESCE(to_char(o.merchant_accepted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), ''),
		       COALESCE(to_char(o.food_ready_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), ''),
		       COALESCE(to_char(o.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), ''),
		       COALESCE(o.order_notes, '')
		FROM orders o
		LEFT JOIN users c ON c.id = o.customer_id
		WHERE o.merchant_id = $1
		  AND o.service_sub_type = 'food_delivery'
		  AND ($2 = '' OR o.status = $2)
		ORDER BY o.created_at DESC
		LIMIT $3 OFFSET $4`

	rows, err := r.readDB.QueryContext(ctx, query, merchantID, status, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []*domain.MerchantOrderView{}
	index := map[string]*domain.MerchantOrderView{}
	orderIDs := []string{}
	for rows.Next() {
		var v domain.MerchantOrderView
		var acceptedAt, readyAt, createdAt, orderNotes string
		if err := rows.Scan(
			&v.ID, &v.OrderNumber, &v.Status,
			&v.CustomerName, &v.CustomerPhone, &v.DropoffAddress,
			&v.TotalPriceIDR, &v.DistanceKM,
			&acceptedAt, &readyAt, &createdAt,
			&orderNotes,
		); err != nil {
			return nil, err
		}
		v.OrderNotes = orderNotes // FB-121
		if acceptedAt != "" {
			v.MerchantAcceptedAt = &acceptedAt
		}
		if readyAt != "" {
			v.FoodReadyAt = &readyAt
		}
		v.CreatedAt = createdAt
		// FB-085 Number Masking (UU PDP): nomor customer hanya dibuka saat order
		// MASIH AKTIF. Setelah order selesai/dibatalkan/gagal, nomor di-mask
		// (0812-XXXX-XX34) — merchant tidak perlu menghubungi customer lagi.
		if isOrderInactive(v.Status) {
			v.CustomerPhone = util.MaskPhone(v.CustomerPhone)
		}
		v.Items = []domain.FoodOrderItemView{}
		out = append(out, &v)
		index[v.ID] = &v
		orderIDs = append(orderIDs, v.ID)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	if len(orderIDs) > 0 {
		if err := r.attachItems(ctx, index, orderIDs); err != nil {
			return nil, err
		}
	}
	return out, nil
}

func (r *postgresMerchantOrderRepository) attachItems(ctx context.Context, index map[string]*domain.MerchantOrderView, orderIDs []string) error {
	q := `SELECT order_id, item_name, quantity, item_price, subtotal, COALESCE(notes, '')
	      FROM food_order_items WHERE order_id = ANY($1) ORDER BY created_at`
	rows, err := r.readDB.QueryContext(ctx, q, orderIDs)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var orderID, notes string
		var item domain.FoodOrderItemView
		if err := rows.Scan(&orderID, &item.ItemName, &item.Quantity, &item.ItemPrice, &item.Subtotal, &notes); err != nil {
			return err
		}
		item.Notes = notes
		if v, ok := index[orderID]; ok {
			v.Items = append(v.Items, item)
		}
	}
	return rows.Err()
}

func (r *postgresMerchantOrderRepository) CountByMerchant(ctx context.Context, merchantID, status string) (int, error) {
	var n int
	err := r.readDB.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM orders
		WHERE merchant_id = $1 AND service_sub_type = 'food_delivery'
		  AND ($2 = '' OR status = $2)`, merchantID, status).Scan(&n)
	return n, err
}

// GetOrderForStruk — ambil order food milik merchant + items untuk struk
// (FOOD-BIKE-034). Merupakan satu-satunya path yang meng-ekspos
// handover_token ke merchant — dipakai untuk generate QR struk.
func (r *postgresMerchantOrderRepository) GetOrderForStruk(ctx context.Context, merchantID, orderID string) (*domain.StrukData, error) {
	var s domain.StrukData
	var createdAt string
	err := r.readDB.QueryRowContext(ctx, `
		SELECT o.id, o.order_number, o.status, COALESCE(o.handover_token, ''),
		       COALESCE(o.total_price_idr, 0),
		       COALESCE(o.dropoff_address, ''),
		       COALESCE(c.full_name, ''),
		       COALESCE(to_char(o.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), ''),
		       COALESCE(m.nama_toko, ''),
		       COALESCE(m.alamat, '')
		FROM orders o
		JOIN merchants m ON m.id = o.merchant_id
		LEFT JOIN users c ON c.id = o.customer_id
		WHERE o.id = $1 AND o.merchant_id = $2
		  AND o.service_sub_type = 'food_delivery'`, orderID, merchantID,
	).Scan(
		&s.OrderID, &s.OrderNumber, &s.Status, &s.HandoverToken,
		&s.TotalPriceIDR, &s.DropoffAddress, &s.CustomerName,
		&createdAt, &s.MerchantName, &s.MerchantAddress,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, errors.New("order tidak ditemukan atau bukan milik merchant")
		}
		return nil, fmt.Errorf("get order for struk: %w", err)
	}
	s.CreatedAt = createdAt
	s.Items = []domain.FoodOrderItemView{}

	rows, err := r.readDB.QueryContext(ctx, `
		SELECT item_name, quantity, item_price, subtotal, COALESCE(notes, '')
		FROM food_order_items
		WHERE order_id = $1
		ORDER BY created_at`, orderID)
	if err != nil {
		return nil, fmt.Errorf("get struk items: %w", err)
	}
	defer rows.Close()

	var subtotalIDR int64
	for rows.Next() {
		var it domain.FoodOrderItemView
		if err := rows.Scan(&it.ItemName, &it.Quantity, &it.ItemPrice, &it.Subtotal, &it.Notes); err != nil {
			return nil, err
		}
		subtotalIDR += it.Subtotal
		s.Items = append(s.Items, it)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	s.SubtotalIDR = subtotalIDR
	s.DeliveryFeeIDR = s.TotalPriceIDR - subtotalIDR
	if s.DeliveryFeeIDR < 0 {
		s.DeliveryFeeIDR = 0
	}
	return &s, nil
}

// isOrderInactive — FB-085: true kalau order sudah di terminal state
// (selesai / batal / gagal). Di state ini nomor customer di-mask karena
// merchant tidak perlu menghubungi customer lagi. Semua status lain
// (pending_merchant, preparing, searching, assigned, picked_up, in_transit)
// dianggap AKTIF → nomor asli tetap dibuka.
func isOrderInactive(status string) bool {
	switch status {
	case "delivered", "cancelled", "failed", "no_courier_found", "fraud_review":
		return true
	default:
		return false
	}
}

// GetOrderForEdit — FB-087: ambil order food milik merchant untuk edit item.
// Order harus status pending_merchant (belum dikonfirmasi merchant).
func (r *postgresMerchantOrderRepository) GetOrderForEdit(ctx context.Context, merchantID, orderID string) (*domain.OrderEditData, error) {
	var d domain.OrderEditData
	err := r.readDB.QueryRowContext(ctx, `
		SELECT o.id, o.status,
		       COALESCE(o.base_price_idr, 0),
		       COALESCE(o.distance_fee_idr, 0),
		       COALESCE(o.platform_fee_idr, 0),
		       COALESCE(o.platform_fee_pct, 0),
		       COALESCE(o.discount_idr, 0)
		FROM orders o
		WHERE o.id = $1 AND o.merchant_id = $2
		  AND o.service_sub_type = 'food_delivery'`, orderID, merchantID,
	).Scan(&d.ID, &d.Status, &d.SubtotalOldIDR, &d.DeliveryFeeIDR, &d.PlatformFeeIDR, &d.PlatformFeePct, &d.DiscountIDR)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, errors.New("order tidak ditemukan atau bukan milik merchant")
		}
		return nil, fmt.Errorf("get order for edit: %w", err)
	}
	if d.Status != "pending_merchant" {
		return nil, errors.New("order hanya bisa diedit sebelum dikonfirmasi (status pending_merchant)")
	}

	rows, err := r.readDB.QueryContext(ctx, `
		SELECT item_name, quantity, item_price, subtotal, COALESCE(notes, '')
		FROM food_order_items
		WHERE order_id = $1
		ORDER BY created_at`, orderID)
	if err != nil {
		return nil, fmt.Errorf("get order edit items: %w", err)
	}
	defer rows.Close()

	d.Items = []domain.FoodOrderItemView{}
	for rows.Next() {
		var it domain.FoodOrderItemView
		if err := rows.Scan(&it.ItemName, &it.Quantity, &it.ItemPrice, &it.Subtotal, &it.Notes); err != nil {
			return nil, fmt.Errorf("scan edit item: %w", err)
		}
		d.Items = append(d.Items, it)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("get order edit items rows: %w", err)
	}
	return &d, nil
}

// ReplaceOrderItems — FB-087: replace snapshot items + update harga order
// dalam SATU transaksi. Dipanggil hanya saat status pending_merchant
// (sudah divalidasi di GetOrderForEdit / service).
func (r *postgresMerchantOrderRepository) ReplaceOrderItems(ctx context.Context, orderID string, items []domain.FoodOrderItemSnapshot, subtotal, platformFee, total int64) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := tx.ExecContext(ctx, `DELETE FROM food_order_items WHERE order_id = $1`, orderID); err != nil {
		return fmt.Errorf("delete order items: %w", err)
	}

	for i := range items {
		it := &items[i]
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO food_order_items (
				order_id, menu_item_id, item_name, item_price,
				quantity, notes, subtotal, created_at
			) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
			orderID, it.MenuItemID, it.ItemName, it.ItemPrice,
			it.Quantity, it.Notes, it.Subtotal,
		); err != nil {
			return fmt.Errorf("insert replaced order item: %w", err)
		}
	}

	if _, err := tx.ExecContext(ctx, `
		UPDATE orders
		SET base_price_idr = $2,
		    dynamic_price_idr = $2,
		    platform_fee_idr = $3,
		    total_price_idr = $4,
		    updated_at = NOW()
		WHERE id = $1 AND service_sub_type = 'food_delivery'`, orderID, subtotal, platformFee, total); err != nil {
		return fmt.Errorf("update order prices: %w", err)
	}

	return tx.Commit()
}
