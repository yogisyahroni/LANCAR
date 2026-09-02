package repository

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	"tembus/order-service/internal/domain"

	"github.com/google/uuid"
)

// foodRepo — implementasi domain.FoodRepository (FOOD-BIKE-072/073/074).
// Order-service butuh: baca merchant, baca menu items, dan tulis
// order + food_order_items dalam SATU transaksi.
// Composition ke *postgresRepo supaya bisa pakai insertOrder helper.
type foodRepo struct {
	*postgresRepo
}

func NewFoodRepository(db, readDB *sql.DB, configRepo domain.ConfigRepository) domain.FoodRepository {
	return &foodRepo{
		postgresRepo: &postgresRepo{db: db, readDB: readDB, configRepo: configRepo},
	}
}

// GetFoodMerchant — ambil merchant + lokasi (pickup) untuk validasi order food.
func (r *foodRepo) GetFoodMerchant(ctx context.Context, merchantID string) (*domain.FoodMerchantInfo, error) {
	query := `
		SELECT
			id::text,
			nama_toko,
			alamat,
			is_open,
			verification_status,
			paused_until,
			busy_until,
			busy_extra_prep_minutes,
			min_order_idr,
			COALESCE(ST_Y(lokasi::geometry), 0),
			COALESCE(ST_X(lokasi::geometry), 0),
			jam_buka::text,
			jam_tutup::text,
			halal_status
			FROM merchants
			WHERE id = $1`

	m := &domain.FoodMerchantInfo{}
	var jamBuka, jamTutup, halalStatus sql.NullString
	var pausedUntil sql.NullTime
	var busyUntil sql.NullTime
	err := r.readDB.QueryRowContext(ctx, query, merchantID).Scan(
		&m.ID, &m.Name, &m.Address, &m.IsOpen, &m.VerificationStatus,
		&pausedUntil, &busyUntil, &m.BusyExtraPrepMinutes, &m.MinOrderIDR, &m.Lat, &m.Lng, &jamBuka, &jamTutup, &halalStatus,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("merchant not found: %s", merchantID)
		}
		return nil, err
	}
	if pausedUntil.Valid {
		m.PausedUntil = &pausedUntil.Time
	}
	if busyUntil.Valid {
		m.BusyUntil = &busyUntil.Time
	}
	if jamBuka.Valid {
		m.JamBuka = &jamBuka.String
	}
	if jamTutup.Valid {
		m.JamTutup = &jamTutup.String
	}
	if halalStatus.Valid {
		m.HalalStatus = halalStatus.String
	}
	return m, nil
}

// GetFoodMenuItems — ambil menu items by IDs (harga diambil server-side,
// client TIDAK bisa kirim harga sendiri — zero-trust).
func (r *foodRepo) GetFoodMenuItems(ctx context.Context, menuIDs []string) ([]domain.FoodMenuItemInfo, error) {
	if len(menuIDs) == 0 {
		return nil, nil
	}

	placeholders := make([]string, len(menuIDs))
	args := make([]any, len(menuIDs))
	for i, id := range menuIDs {
		placeholders[i] = fmt.Sprintf("$%d", i+1)
		args[i] = id
	}

	query := fmt.Sprintf(`
		SELECT
			id::text,
			merchant_id::text,
			nama,
			harga,
			is_available,
			prep_time_minutes,
			stock_quantity,
			daily_sales_limit,
			daily_sales_count,
			sales_limit_reset_at
		FROM merchant_menu_items
		WHERE id IN (%s)`, strings.Join(placeholders, ", "))

	rows, err := r.readDB.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []domain.FoodMenuItemInfo
	for rows.Next() {
		var it domain.FoodMenuItemInfo
		if err := rows.Scan(&it.ID, &it.MerchantID, &it.Name, &it.Price, &it.IsAvailable, &it.PrepTimeMinutes, &it.StockQuantity, &it.DailySalesLimit, &it.DailySalesCount, &it.SalesResetAt); err != nil {
			return nil, err
		}
		items = append(items, it)
	}
	return items, rows.Err()
}

// CreateFoodOrderWithItems — insert order + food_order_items dalam SATU
// transaksi (atomic: gagal satu, batal semua).
func (r *foodRepo) CreateFoodOrderWithItems(ctx context.Context, order *domain.Order, items []domain.FoodOrderItem) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	quantities := make(map[string]int, len(items))
	menuItemIDs := make([]string, 0, len(items))
	for _, item := range items {
		if _, exists := quantities[item.MenuItemID]; !exists {
			menuItemIDs = append(menuItemIDs, item.MenuItemID)
		}
		quantities[item.MenuItemID] += item.Quantity
	}
	previousAvailability := make(map[string]bool, len(menuItemIDs))
	for _, menuItemID := range menuItemIDs {
		var previousAvailable bool
		if err := tx.QueryRowContext(ctx, `
			SELECT is_available
			FROM merchant_menu_items
			WHERE id = $1
			FOR UPDATE`, menuItemID).Scan(&previousAvailable); err != nil {
			return fmt.Errorf("kunci stok item %s: %w", menuItemID, err)
		}
		previousAvailability[menuItemID] = previousAvailable

		quantity := quantities[menuItemID]
		var resetAt *time.Time
		reserveErr := tx.QueryRowContext(ctx, `
			WITH normalized AS (
				SELECT id,
				       CASE WHEN sales_limit_reset_at IS NOT NULL AND sales_limit_reset_at <= NOW()
				            THEN 0 ELSE daily_sales_count END AS current_sales,
				       CASE WHEN sales_limit_reset_at IS NOT NULL AND sales_limit_reset_at <= NOW()
				            THEN date_trunc('day', NOW()) + interval '1 day'
				            ELSE sales_limit_reset_at END AS next_reset
				FROM merchant_menu_items
				WHERE id = $1
				FOR UPDATE
			)
			UPDATE merchant_menu_items m
			SET stock_quantity = CASE WHEN m.stock_quantity IS NULL THEN NULL ELSE m.stock_quantity - $2 END,
			    daily_sales_count = CASE WHEN m.daily_sales_limit IS NULL THEN m.daily_sales_count ELSE n.current_sales + $2 END,
			    sales_limit_reset_at = CASE WHEN m.daily_sales_limit IS NULL THEN m.sales_limit_reset_at ELSE n.next_reset END,
			    is_available = CASE WHEN m.stock_quantity IS NOT NULL AND m.stock_quantity = $2 THEN FALSE ELSE m.is_available END,
			    updated_at = NOW()
			FROM normalized n
			WHERE m.id = n.id
			  AND (m.stock_quantity IS NULL OR m.stock_quantity >= $2)
			  AND (m.daily_sales_limit IS NULL OR n.current_sales + $2 <= m.daily_sales_limit)
			RETURNING m.sales_limit_reset_at`, menuItemID, quantity).Scan(&resetAt)
		if reserveErr != nil {
			return fmt.Errorf("stok menu tidak cukup atau batas penjualan harian tercapai untuk item %s: %w", menuItemID, reserveErr)
		}
	}

	if err := r.insertOrder(ctx, tx, order); err != nil {
		return fmt.Errorf("insert order: %w", err)
	}
	for _, menuItemID := range menuItemIDs {
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO food_inventory_reservations (order_id, menu_item_id, quantity, previous_is_available)
			VALUES ($1, $2, $3, $4)`, order.ID, menuItemID, quantities[menuItemID], previousAvailability[menuItemID]); err != nil {
			return fmt.Errorf("catat reservasi stok item %s: %w", menuItemID, err)
		}
	}

	for i := range items {
		it := &items[i]
		it.ID = uuid.New().String()
		it.OrderID = order.ID
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO food_order_items (
				id, order_id, menu_item_id, item_name, item_price,
				quantity, notes, subtotal, created_at
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
			it.ID, it.OrderID, it.MenuItemID, it.ItemName, it.ItemPrice,
			it.Quantity, it.Notes, it.Subtotal, time.Now(),
		); err != nil {
			return fmt.Errorf("insert food_order_items: %w", err)
		}
		// FB-108: snapshot pilihan varian per item (nama + delta beku).
		for _, v := range it.Variants {
			if _, err := tx.ExecContext(ctx, `
				INSERT INTO food_order_item_variants (
					order_item_id, variant_id, option_id,
					variant_name, option_name, price_delta, created_at
				) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
				it.ID, v.VariantID, v.OptionID,
				v.VariantName, v.OptionName, v.PriceDelta, time.Now(),
			); err != nil {
				return fmt.Errorf("insert food_order_item_variants: %w", err)
			}
		}
	}

	return tx.Commit()
}

// ReleaseFoodInventory returns a reservation exactly once. It is called by
// cancellation/refund paths after an order leaves the food lifecycle.
func (r *foodRepo) ReleaseFoodInventory(ctx context.Context, orderID string) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	rows, err := tx.QueryContext(ctx, `
		SELECT menu_item_id::text, quantity, previous_is_available
		FROM food_inventory_reservations
		WHERE order_id = $1 AND status = 'reserved'
		FOR UPDATE`, orderID)
	if err != nil {
		return err
	}
	type reservation struct {
		menuItemID        string
		quantity          int
		previousAvailable bool
	}
	var reservations []reservation
	for rows.Next() {
		var item reservation
		if err := rows.Scan(&item.menuItemID, &item.quantity, &item.previousAvailable); err != nil {
			_ = rows.Close()
			return err
		}
		reservations = append(reservations, item)
	}
	if err := rows.Err(); err != nil {
		_ = rows.Close()
		return err
	}
	_ = rows.Close()
	for _, item := range reservations {
		if _, err := tx.ExecContext(ctx, `
			UPDATE merchant_menu_items
			SET stock_quantity = CASE WHEN stock_quantity IS NULL THEN NULL ELSE stock_quantity + $2 END,
				daily_sales_count = CASE WHEN daily_sales_limit IS NULL THEN daily_sales_count ELSE GREATEST(0, daily_sales_count - $2) END,
				is_available = $3,
				updated_at = NOW()
			WHERE id = $1`, item.menuItemID, item.quantity, item.previousAvailable); err != nil {
			return fmt.Errorf("release stok item %s: %w", item.menuItemID, err)
		}
	}
	if _, err := tx.ExecContext(ctx, `
		UPDATE food_inventory_reservations
		SET status = 'released', released_at = NOW()
		WHERE order_id = $1 AND status = 'reserved'`, orderID); err != nil {
		return err
	}
	return tx.Commit()
}

// GetMenuItemVariants — FB-108: ambil semua grup varian + opsi untuk menu IDs.
// Map key = menu_item_id. Menu tanpa varian tidak muncul di map (caller
// treat sebagai item single-variant).
func (r *foodRepo) GetMenuItemVariants(ctx context.Context, menuIDs []string) (map[string][]domain.MenuItemVariant, error) {
	result := make(map[string][]domain.MenuItemVariant)
	if len(menuIDs) == 0 {
		return result, nil
	}

	placeholders := make([]string, len(menuIDs))
	args := make([]any, len(menuIDs))
	for i, id := range menuIDs {
		placeholders[i] = fmt.Sprintf("$%d", i+1)
		args[i] = id
	}

	// 1. Grup varian
	variantRows, err := r.readDB.QueryContext(ctx, fmt.Sprintf(`
		SELECT id::text, menu_item_id::text, nama, is_required, min_select, max_select
		FROM menu_item_variants
		WHERE menu_item_id IN (%s)
		ORDER BY sort_order ASC, created_at ASC`, strings.Join(placeholders, ", ")), args...)
	if err != nil {
		return nil, fmt.Errorf("query menu_item_variants: %w", err)
	}
	defer variantRows.Close()

	variants := make([]domain.MenuItemVariant, 0)
	for variantRows.Next() {
		var v domain.MenuItemVariant
		if err := variantRows.Scan(&v.ID, &v.MenuID, &v.Nama, &v.IsRequired, &v.MinSelect, &v.MaxSelect); err != nil {
			return nil, err
		}
		variants = append(variants, v)
	}
	if err := variantRows.Err(); err != nil {
		return nil, err
	}
	if len(variants) == 0 {
		return result, nil
	}

	// 2. Opsi untuk semua varian (sekali query, IN variants)
	variantIDs := make([]string, len(variants))
	for i := range variants {
		variantIDs[i] = variants[i].ID
	}
	optPlaceholders := make([]string, len(variantIDs))
	optArgs := make([]any, len(variantIDs))
	for i, id := range variantIDs {
		optPlaceholders[i] = fmt.Sprintf("$%d", i+1)
		optArgs[i] = id
	}
	optRows, err := r.readDB.QueryContext(ctx, fmt.Sprintf(`
		SELECT id::text, variant_id::text, nama, price_delta, is_default
		FROM menu_item_variant_options
		WHERE variant_id IN (%s)
		ORDER BY created_at ASC`, strings.Join(optPlaceholders, ", ")), optArgs...)
	if err != nil {
		return nil, fmt.Errorf("query menu_item_variant_options: %w", err)
	}
	defer optRows.Close()

	optionsByVariant := make(map[string][]domain.MenuItemVariantOption)
	for optRows.Next() {
		var o domain.MenuItemVariantOption
		if err := optRows.Scan(&o.ID, &o.VariantID, &o.Nama, &o.PriceDelta, &o.IsDefault); err != nil {
			return nil, err
		}
		optionsByVariant[o.VariantID] = append(optionsByVariant[o.VariantID], o)
	}
	if err := optRows.Err(); err != nil {
		return nil, err
	}

	for i := range variants {
		v := variants[i]
		v.Options = optionsByVariant[v.ID]
		result[v.MenuID] = append(result[v.MenuID], v)
	}
	return result, nil
}

// GetFoodOrderItems — snapshot item food sebuah order (FB-080: dipakai refund
// partial per item — harga beku di waktu order, bukan harga menu live).
func (r *foodRepo) GetFoodOrderItems(ctx context.Context, orderID string) ([]domain.FoodOrderItem, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, order_id, menu_item_id, item_name, item_price,
		       quantity, notes, subtotal
		FROM food_order_items
		WHERE order_id = $1
		ORDER BY created_at ASC`, orderID)
	if err != nil {
		return nil, fmt.Errorf("query food_order_items: %w", err)
	}
	defer rows.Close()

	var items []domain.FoodOrderItem
	for rows.Next() {
		var it domain.FoodOrderItem
		if err := rows.Scan(&it.ID, &it.OrderID, &it.MenuItemID, &it.ItemName,
			&it.ItemPrice, &it.Quantity, &it.Notes, &it.Subtotal); err != nil {
			return nil, err
		}
		items = append(items, it)
	}
	return items, rows.Err()
}

// ── FOOD-BIKE-021/022: transisi status food delivery ─────────────────────────

// GetFoodOrderForMerchant — validasi kepemilikan order food sebelum accept/reject.
// Hanya mengembalikan order yang service_sub_type='food_delivery' milik merchant.
func (r *foodRepo) GetFoodOrderForMerchant(ctx context.Context, orderID, merchantID string) (*domain.Order, error) {
	var id string
	var status domain.OrderStatus
	var prep int
	err := r.readDB.QueryRowContext(ctx, `
		SELECT id::text, status, COALESCE(prep_time_minutes, 0)
		FROM orders
		WHERE id = $1 AND merchant_id = $2 AND service_sub_type = 'food_delivery'`,
		orderID, merchantID,
	).Scan(&id, &status, &prep)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("food order not found for merchant: %s", orderID)
		}
		return nil, err
	}
	o := &domain.Order{ID: id, Status: status}
	prepVal := prep
	o.PrepTimeMinutes = &prepVal
	return o, nil
}

// AcceptFoodOrder — pending_merchant → preparing.
// food_ready_at = NOW() + prep_time_minutes (dasar trigger matching worker).
func (r *foodRepo) AcceptFoodOrder(ctx context.Context, orderID string, prepMinutes int) error {
	if r.postgresRepo != nil {
		_, err := r.postgresRepo.TransitionOrder(ctx, domain.OrderTransitionRequest{
			OrderID:            orderID,
			Actor:              domain.OrderActorPlatform,
			TargetStatus:       domain.StatusPreparing,
			IdempotencyKey:     "food-accept:" + orderID,
			EventMessage:       "Pesanan makanan diterima — makanan disiapkan",
			PreparationMinutes: prepMinutes,
		})
		return err
	}
	res, err := r.db.ExecContext(ctx, `
		UPDATE orders SET
			status = 'preparing',
			merchant_accepted_at = NOW(),
			food_ready_at = NOW() + ($1 * INTERVAL '1 minute')
		WHERE id = $2 AND status = 'pending_merchant'`,
		prepMinutes, orderID,
	)
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return fmt.Errorf("order %s tidak dalam status pending_merchant", orderID)
	}
	return nil
}

// RejectFoodOrder — pending_merchant → cancelled + cancellation_reason.
// Dipakai merchant menolak, dan worker auto-cancel timeout (FOOD-BIKE-022).
func (r *foodRepo) RejectFoodOrder(ctx context.Context, orderID, reason string) error {
	if r.postgresRepo != nil {
		_, err := r.postgresRepo.TransitionOrder(ctx, domain.OrderTransitionRequest{
			OrderID:        orderID,
			Actor:          domain.OrderActorPlatform,
			TargetStatus:   domain.StatusCancelled,
			Reason:         reason,
			IdempotencyKey: "food-reject:" + orderID,
			EventMessage:   "Pesanan makanan ditolak: " + reason,
		})
		return err
	}
	res, err := r.db.ExecContext(ctx, `
		UPDATE orders SET
			status = 'cancelled',
			cancellation_reason = $2,
			cancelled_at = NOW()
		WHERE id = $1 AND status = 'pending_merchant'`,
		orderID, reason,
	)
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return fmt.Errorf("order %s tidak dalam status pending_merchant", orderID)
	}
	return nil
}

// GetPreparingFoodOrders — order food preparing yang food_ready_at sudah <=
// NOW()+5 menit (matching driver dimulai 5 menit sebelum makanan siap, supaya
// driver sudah standby saat siap di-pickup).
func (r *foodRepo) GetPreparingFoodOrders(ctx context.Context) ([]*domain.Order, error) {
	rows, err := r.readDB.QueryContext(ctx, `
		SELECT id::text
		FROM orders
		WHERE service_sub_type = 'food_delivery'
		  AND status = 'preparing'
		  AND merchant_accepted_at IS NOT NULL
		  AND food_ready_at IS NOT NULL
		  AND food_ready_at <= NOW() + INTERVAL '5 minutes'`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*domain.Order
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, &domain.Order{ID: id})
	}
	return out, rows.Err()
}

// ListFoodMerchants — FOOD-BIKE-055: browse merchant food terdekat.
// Hanya merchant is_open = true + verification_status = 'approved'.
// Distance dihitung dari lokasi customer (Haversine via geography).
// halal: "all"|"" (semua, default) | "halal_certified" | "non_halal" (ADR 003).
func (r *foodRepo) ListFoodMerchants(ctx context.Context, lat, lng float64, search, halal string, limit int) ([]domain.FoodMerchantInfo, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	// Filter halal (ADR 003): unknown TIDAK muncul di filter apapun kecuali all.
	halalClause := ""
	if halal == "halal_certified" || halal == "non_halal" {
		halalClause = "AND m.halal_status = '" + halal + "'"
	}
	var rows *sql.Rows
	var err error
	if search == "" {
		rows, err = r.readDB.QueryContext(ctx, `
			SELECT
				m.id::text, m.nama_toko, m.alamat, m.is_open, m.verification_status,
				COALESCE(ST_Y(m.lokasi::geometry), 0), COALESCE(ST_X(m.lokasi::geometry), 0),
				m.jam_buka::text, m.jam_tutup::text, m.halal_status,
				ROUND(CAST(ST_Distance(m.lokasi, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) / 1000 AS NUMERIC), 2)::float AS distance_km,
				COALESCE(AVG(r.stars), 0)::float AS avg_rating,
				COUNT(r.id) AS rating_count
			FROM merchants m
			LEFT JOIN merchant_ratings r ON r.merchant_id = m.id
			WHERE m.is_open = TRUE AND m.verification_status = 'approved'
			  AND (m.paused_until IS NULL OR m.paused_until <= NOW()) -- FB-107
			  `+halalClause+`
			GROUP BY m.id
			ORDER BY distance_km ASC
			LIMIT $3`,
			lng, lat, limit,
		)
	} else {
		rows, err = r.readDB.QueryContext(ctx, `
			SELECT
				m.id::text, m.nama_toko, m.alamat, m.is_open, m.verification_status,
				COALESCE(ST_Y(m.lokasi::geometry), 0), COALESCE(ST_X(m.lokasi::geometry), 0),
				m.jam_buka::text, m.jam_tutup::text, m.halal_status,
				ROUND(CAST(ST_Distance(m.lokasi, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) / 1000 AS NUMERIC), 2)::float AS distance_km,
				COALESCE(AVG(r.stars), 0)::float AS avg_rating,
				COUNT(r.id) AS rating_count
			FROM merchants m
			LEFT JOIN merchant_ratings r ON r.merchant_id = m.id
			WHERE m.is_open = TRUE AND m.verification_status = 'approved'
			AND (m.paused_until IS NULL OR m.paused_until <= NOW()) -- FB-107
			  `+halalClause+`
			  AND (
			  m.nama_toko ILIKE '%' || $3 || '%'
				  OR m.alamat ILIKE '%' || $3 || '%'
				  OR EXISTS (
					  SELECT 1 FROM merchant_menu_items mi
					  WHERE mi.merchant_id = m.id AND mi.nama ILIKE '%' || $3 || '%'
				  )
			  )
			GROUP BY m.id
			ORDER BY distance_km ASC
			LIMIT $4`,
			lng, lat, search, limit,
		)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	// UAT-C-004: return [] bukan nil — kalau kosong, JSON "merchants": []
	// (bukan null) supaya client tidak crash saat iterate.
	out := []domain.FoodMerchantInfo{}
	for rows.Next() {
		var m domain.FoodMerchantInfo
		var jamBuka, jamTutup, halalStatus sql.NullString
		if err := rows.Scan(
			&m.ID, &m.Name, &m.Address, &m.IsOpen, &m.VerificationStatus,
			&m.Lat, &m.Lng, &jamBuka, &jamTutup, &halalStatus, &m.DistanceKM, &m.AvgRating, &m.RatingCount,
		); err != nil {
			return nil, err
		}
		if jamBuka.Valid {
			m.JamBuka = &jamBuka.String
		}
		if jamTutup.Valid {
			m.JamTutup = &jamTutup.String
		}
		if halalStatus.Valid {
			m.HalalStatus = halalStatus.String
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// GetScheduledFoodOrdersDue — FB-123: order status 'scheduled' yang sudah due
// untuk aktivasi. Due = scheduled_at ≤ NOW() + prep_time_minutes + buffer 5
// menit (matching merchant dimulai 5 menit sebelum makanan harus siap).
func (r *foodRepo) GetScheduledFoodOrdersDue(ctx context.Context) ([]domain.ScheduledFoodOrder, error) {
	rows, err := r.readDB.QueryContext(ctx, `
		SELECT
			id::text,
			customer_id::text,
			order_number,
			merchant_id::text,
			scheduled_at,
			COALESCE(prep_time_minutes, 10)
		FROM orders
		WHERE status = 'scheduled'
		  AND merchant_id IS NOT NULL
		  AND scheduled_at IS NOT NULL
		  AND scheduled_at <= NOW() + ((COALESCE(prep_time_minutes, 10) + 5) * INTERVAL '1 minute')
		ORDER BY scheduled_at ASC
		LIMIT 100`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []domain.ScheduledFoodOrder
	for rows.Next() {
		var so domain.ScheduledFoodOrder
		if err := rows.Scan(&so.OrderID, &so.CustomerID, &so.OrderNumber, &so.MerchantID, &so.ScheduledAt, &so.PrepTimeMinutes); err != nil {
			return nil, err
		}
		out = append(out, so)
	}
	return out, rows.Err()
}

// CancelScheduledFoodOrder — FB-123: auto-cancel order terjadwal saat
// aktivasi gagal (merchant tidak valid / lewat jam tutup). Guard
// WHERE status='scheduled' supaya tidak menimpa transisi yang sudah jalan.
func (r *foodRepo) CancelScheduledFoodOrder(ctx context.Context, orderID, reason string) error {
	if r.postgresRepo != nil {
		_, err := r.postgresRepo.TransitionOrder(ctx, domain.OrderTransitionRequest{
			OrderID:        orderID,
			Actor:          domain.OrderActorPlatform,
			TargetStatus:   domain.StatusCancelled,
			Reason:         reason,
			IdempotencyKey: "scheduled-cancel:" + orderID,
			EventMessage:   "Pesanan terjadwal dibatalkan: " + reason,
		})
		return err
	}
	res, err := r.db.ExecContext(ctx, `
		UPDATE orders SET
			status = 'cancelled',
			cancellation_reason = $2,
			cancelled_at = NOW()
		WHERE id = $1 AND status = 'scheduled'`,
		orderID, reason,
	)
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return fmt.Errorf("order %s tidak dalam status scheduled", orderID)
	}
	return nil
}

// ActivateScheduledFoodOrder — FB-123: transisi scheduled → pending_merchant
// saat aktivasi (merchant re-validated OK). Guard status supaya tidak
// menimpa cancel yang sudah jalan duluan.
func (r *foodRepo) ActivateScheduledFoodOrder(ctx context.Context, orderID string) error {
	if r.postgresRepo != nil {
		_, err := r.postgresRepo.TransitionOrder(ctx, domain.OrderTransitionRequest{
			OrderID:        orderID,
			Actor:          domain.OrderActorPlatform,
			TargetStatus:   domain.StatusPendingMerchant,
			IdempotencyKey: "scheduled-activate:" + orderID,
			EventMessage:   "Pesanan terjadwal diaktifkan",
		})
		return err
	}
	res, err := r.db.ExecContext(ctx, `
		UPDATE orders SET
			status = 'pending_merchant'
		WHERE id = $1 AND status = 'scheduled'`,
		orderID,
	)
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return fmt.Errorf("order %s tidak dalam status scheduled", orderID)
	}
	return nil
}

// GetFoodMerchantMenu — FOOD-BIKE-055/056: daftar menu merchant.
func (r *foodRepo) GetFoodMerchantMenu(ctx context.Context, merchantID string) ([]domain.FoodMenuItemInfo, error) {
	rows, err := r.readDB.QueryContext(ctx, `
		SELECT id::text, merchant_id::text, nama, harga, is_available, prep_time_minutes, kategori, foto
		FROM merchant_menu_items
		WHERE merchant_id = $1
		ORDER BY is_available DESC, kategori NULLS LAST, nama ASC`,
		merchantID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []domain.FoodMenuItemInfo
	menuIDs := make([]string, 0)
	for rows.Next() {
		var item domain.FoodMenuItemInfo
		var kategori, foto sql.NullString
		if err := rows.Scan(
			&item.ID, &item.MerchantID, &item.Name, &item.Price, &item.IsAvailable,
			&item.PrepTimeMinutes, &kategori, &foto,
		); err != nil {
			return nil, err
		}
		if kategori.Valid {
			item.Kategori = &kategori.String
		}
		if foto.Valid {
			item.Foto = &foto.String
		}
		out = append(out, item)
		menuIDs = append(menuIDs, item.ID)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// FB-108: attach grup varian per item (sekali query batch).
	variantMap, err := r.GetMenuItemVariants(ctx, menuIDs)
	if err != nil {
		return nil, err
	}
	for i := range out {
		out[i].Variants = variantMap[out[i].ID]
	}
	return out, nil
}

// GetPendingMerchantFoodOrders — order food pending_merchant yang belum direspon
// merchant melebihi timeout (FOOD-BIKE-022: 3 menit) → kandidat auto-cancel.
// updated_at di-update oleh UpdateStatus saat transisi ke pending_merchant,
// jadi dihitung dari sana.
func (r *foodRepo) GetPendingMerchantFoodOrders(ctx context.Context, timeout time.Duration) ([]*domain.Order, error) {
	// FIX 2026-08-11: query bind ($1 * INTERVAL) konflik dengan unnamed
	// prepared statement pgbouncer (transaction pooling) → error 26000/08P01
	// intermittent. Interval dibuat literal — aman (timeout dari konstanta
	// bisnis int seconds), dan bebas prepared statement.
	q := fmt.Sprintf(`
		SELECT id::text
		FROM orders
		WHERE service_sub_type = 'food_delivery'
		  AND status = 'pending_merchant'
		  AND updated_at <= NOW() - INTERVAL '%d seconds'`,
		int(timeout.Seconds()),
	)
	rows, err := r.readDB.QueryContext(ctx, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*domain.Order
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, &domain.Order{ID: id})
	}
	return out, rows.Err()
}

// ── FB-088: batching driver food ──────────────────────────────────────────

// GetSearchingFoodOrdersForBatch — order food `searching` (matching driver
// aktif) tanpa batch_id yang siap dipairing. Timebox: searching ≤ 2 menit
// supaya GATE SLA aman — kalau belum ada pasangan dalam window, order jalan
// solo (broadcast normal).
func (r *foodRepo) GetSearchingFoodOrdersForBatch(ctx context.Context) ([]*domain.Order, error) {
	rows, err := r.readDB.QueryContext(ctx, `
		SELECT id::text
		FROM orders
		WHERE service_sub_type = 'food_delivery'
		  AND status = 'searching'
		  AND batch_id IS NULL
		  AND updated_at >= NOW() - INTERVAL '2 minutes'
		ORDER BY updated_at ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*domain.Order
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, &domain.Order{ID: id})
	}
	return out, rows.Err()
}

// FindBatchCandidate — cari pasangan batch untuk order tertentu:
// merchant sama, dropoff ≤ maxRadiusKM (Haversine), bukan customer yang sama,
// belum punya batch, masih searching, dan status bukan pending/cancelled.
// Return kandidat + jarak antar dropoff (meter).
func (r *foodRepo) FindBatchCandidate(ctx context.Context, orderID string, maxRadiusKM float64) (*domain.Order, float64, error) {
	var (
		candID     string
		distMeters float64
	)
	err := r.readDB.QueryRowContext(ctx, `
		SELECT o2.id::text,
		       ST_Distance(
		           ST_SetSRID(ST_MakePoint(o1.dropoff_lng, o1.dropoff_lat), 4326)::geography,
		           ST_SetSRID(ST_MakePoint(o2.dropoff_lng, o2.dropoff_lat), 4326)::geography
		       ) AS distance_m
		FROM orders o1
		JOIN orders o2 ON o2.merchant_id = o1.merchant_id
		              AND o2.service_sub_type = 'food_delivery'
		              AND o2.status = 'searching'
		              AND o2.batch_id IS NULL
		              AND o2.customer_id <> o1.customer_id
		              AND o2.id <> o1.id
		WHERE o1.id = $1
		  AND o1.service_sub_type = 'food_delivery'
		  AND o1.status = 'searching'
		  AND o1.batch_id IS NULL
		ORDER BY distance_m ASC
		LIMIT 1`,
		orderID,
	).Scan(&candID, &distMeters)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, 0, nil
		}
		return nil, 0, err
	}
	if maxRadiusKM > 0 && distMeters > maxRadiusKM*1000 {
		return nil, 0, nil
	}
	return &domain.Order{ID: candID}, distMeters, nil
}

// CreateFoodBatch — insert food_batches (status forming) + set batch_id
// kedua order dalam SATU transaksi. Atomic: gagal satu → batal semua.
func (r *foodRepo) CreateFoodBatch(ctx context.Context, batch *domain.FoodBatch, orderAID, orderBID string) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	if err := tx.QueryRowContext(ctx, `
		INSERT INTO food_batches (
			id, merchant_id, status, order_a_id, order_b_id,
			dropoff_distance_m, max_eta_minutes, created_at, updated_at
		) VALUES ($1, $2, 'forming', $3, $4, $5, $6, $7, $7)
		RETURNING id::text`,
		batch.ID, batch.MerchantID, orderAID, orderBID,
		batch.DropoffDistanceM, batch.MaxETAMinutes, time.Now(),
	).Scan(&batch.ID); err != nil {
		return fmt.Errorf("insert food_batches: %w", err)
	}

	for _, oid := range []string{orderAID, orderBID} {
		if _, err := tx.ExecContext(ctx, `
			UPDATE orders SET batch_id = $1, updated_at = NOW() WHERE id = $2`,
			batch.ID, oid,
		); err != nil {
			return fmt.Errorf("set batch_id on order %s: %w", oid, err)
		}
	}

	return tx.Commit()
}

// GetFoodBatchByOrderID — ambil batch tempat order berada (audit earnings).
func (r *foodRepo) GetFoodBatchByOrderID(ctx context.Context, orderID string) (*domain.FoodBatch, error) {
	b := &domain.FoodBatch{}
	var courierID sql.NullString
	var orderBID sql.NullString
	var completedAt sql.NullTime
	err := r.readDB.QueryRowContext(ctx, `
		SELECT id::text, merchant_id::text, courier_id::text, status,
		       order_a_id::text, order_b_id::text, dropoff_distance_m,
		       max_eta_minutes, created_at, completed_at
		FROM food_batches
		WHERE order_a_id = $1 OR order_b_id = $1
		ORDER BY created_at DESC
		LIMIT 1`,
		orderID,
	).Scan(&b.ID, &b.MerchantID, &courierID, &b.Status,
		&b.OrderAID, &orderBID, &b.DropoffDistanceM,
		&b.MaxETAMinutes, &b.CreatedAt, &completedAt)
	if err != nil {
		return nil, err
	}
	if courierID.Valid {
		b.CourierID = &courierID.String
	}
	if orderBID.Valid {
		b.OrderBID = &orderBID.String
	}
	if completedAt.Valid {
		b.CompletedAt = &completedAt.Time
	}
	return b, nil
}

// UpdateFoodBatchCourier — set courier_id saat courier accept order batch
// (status forming → assigned). Bukan fatal kalau batch tak ditemukan
// (order mungkin di-assign solo setelah pairing batal).
func (r *foodRepo) UpdateFoodBatchCourier(ctx context.Context, batchID, courierID string) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE food_batches
		SET courier_id = $1, status = 'assigned', updated_at = NOW()
		WHERE id = $2 AND status IN ('forming', 'assigned')`,
		courierID, batchID,
	)
	return err
}

// ── FOOD-BIKE-070: Favorite Merchants (C3) ────────────────────────────────

// AddFavoriteMerchant — customer bookmark merchant.
func (r *foodRepo) AddFavoriteMerchant(ctx context.Context, customerID, merchantID string) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO customer_favorite_merchants (customer_id, merchant_id)
		VALUES ($1, $2)
		ON CONFLICT (customer_id, merchant_id) DO NOTHING`,
		customerID, merchantID,
	)
	return err
}

// RemoveFavoriteMerchant — customer hapus bookmark.
func (r *foodRepo) RemoveFavoriteMerchant(ctx context.Context, customerID, merchantID string) error {
	_, err := r.db.ExecContext(ctx, `
		DELETE FROM customer_favorite_merchants
		WHERE customer_id = $1 AND merchant_id = $2`,
		customerID, merchantID,
	)
	return err
}

// ListFavoriteMerchants — customer lihat daftar favorite merchant + detail dasar.
func (r *foodRepo) ListFavoriteMerchants(ctx context.Context, customerID string) ([]domain.FoodMerchantInfo, error) {
	rows, err := r.readDB.QueryContext(ctx, `
		SELECT
			m.id::text, m.nama_toko, m.alamat, m.is_open, m.verification_status,
			COALESCE(ST_Y(m.lokasi::geometry), 0), COALESCE(ST_X(m.lokasi::geometry), 0),
			m.jam_buka::text, m.jam_tutup::text, m.halal_status,
			ROUND(CAST(ST_Distance(m.lokasi, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography) / 1000 AS NUMERIC), 2)::float AS distance_km,
			COALESCE(AVG(r.stars), 0)::float AS avg_rating,
			COUNT(r.id) AS rating_count
		FROM customer_favorite_merchants cfm
		JOIN merchants m ON m.id = cfm.merchant_id
		LEFT JOIN merchant_ratings r ON r.merchant_id = m.id
		WHERE cfm.customer_id = $3
		GROUP BY m.id
		ORDER BY cfm.created_at DESC`,
		0, 0, customerID, // lat/lng = 0,0 for favorites (no distance sort needed)
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []domain.FoodMerchantInfo{}
	for rows.Next() {
		var m domain.FoodMerchantInfo
		var jamBuka, jamTutup, halalStatus sql.NullString
		if err := rows.Scan(
			&m.ID, &m.Name, &m.Address, &m.IsOpen, &m.VerificationStatus,
			&m.Lat, &m.Lng, &jamBuka, &jamTutup, &halalStatus, &m.DistanceKM, &m.AvgRating, &m.RatingCount,
		); err != nil {
			return nil, err
		}
		if jamBuka.Valid {
			m.JamBuka = &jamBuka.String
		}
		if jamTutup.Valid {
			m.JamTutup = &jamTutup.String
		}
		if halalStatus.Valid {
			m.HalalStatus = halalStatus.String
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// CheckIsFavoriteMerchant — cek apakah merchant sudah di-favorite customer.
func (r *foodRepo) CheckIsFavoriteMerchant(ctx context.Context, customerID, merchantID string) (bool, error) {
	var exists bool
	err := r.readDB.QueryRowContext(ctx, `
		SELECT EXISTS(SELECT 1 FROM customer_favorite_merchants WHERE customer_id = $1 AND merchant_id = $2)`,
		customerID, merchantID,
	).Scan(&exists)
	if err != nil {
		return false, err
	}
	return exists, nil
}
