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
			COALESCE(ST_Y(lokasi::geometry), 0),
			COALESCE(ST_X(lokasi::geometry), 0),
			jam_buka::text,
			jam_tutup::text
		FROM merchants
		WHERE id = $1`

	m := &domain.FoodMerchantInfo{}
	var jamBuka, jamTutup sql.NullString
	err := r.readDB.QueryRowContext(ctx, query, merchantID).Scan(
		&m.ID, &m.Name, &m.Address, &m.IsOpen, &m.VerificationStatus,
		&m.Lat, &m.Lng, &jamBuka, &jamTutup,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("merchant not found: %s", merchantID)
		}
		return nil, err
	}
	if jamBuka.Valid {
		m.JamBuka = &jamBuka.String
	}
	if jamTutup.Valid {
		m.JamTutup = &jamTutup.String
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
			prep_time_minutes
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
		if err := rows.Scan(&it.ID, &it.MerchantID, &it.Name, &it.Price, &it.IsAvailable, &it.PrepTimeMinutes); err != nil {
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

	if err := r.insertOrder(ctx, tx, order); err != nil {
		return fmt.Errorf("insert order: %w", err)
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
	}

	return tx.Commit()
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
func (r *foodRepo) ListFoodMerchants(ctx context.Context, lat, lng float64, search string, limit int) ([]domain.FoodMerchantInfo, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	var rows *sql.Rows
	var err error
	if search == "" {
		rows, err = r.readDB.QueryContext(ctx, `
			SELECT
				m.id::text, m.nama_toko, m.alamat, m.is_open, m.verification_status,
				COALESCE(ST_Y(m.lokasi::geometry), 0), COALESCE(ST_X(m.lokasi::geometry), 0),
				m.jam_buka::text, m.jam_tutup::text,
				ROUND(CAST(ST_Distance(m.lokasi, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) / 1000 AS NUMERIC), 2)::float AS distance_km,
				COALESCE(AVG(r.stars), 0)::float AS avg_rating,
				COUNT(r.id) AS rating_count
			FROM merchants m
			LEFT JOIN merchant_ratings r ON r.merchant_id = m.id
			WHERE m.is_open = TRUE AND m.verification_status = 'approved'
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
				m.jam_buka::text, m.jam_tutup::text,
				ROUND(CAST(ST_Distance(m.lokasi, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) / 1000 AS NUMERIC), 2)::float AS distance_km,
				COALESCE(AVG(r.stars), 0)::float AS avg_rating,
				COUNT(r.id) AS rating_count
			FROM merchants m
			LEFT JOIN merchant_ratings r ON r.merchant_id = m.id
			WHERE m.is_open = TRUE AND m.verification_status = 'approved'
			  AND (
				  m.nama_toko ILIKE '%' || $3 || '%'
				  OR m.alamat ILIKE '%' || $3 || '%'
				  -- FB-117: search juga cocokkan nama menu (mekanisme discovery
				  -- utama — customer search "nasi goreng" harus menemukan merchant
				  -- yang menjualnya). EXISTS, BUKAN LEFT JOIN: join menu item
				  -- bakal melipat-gandakan baris rating (cartesian) dan
				  -- merusak agregasi AVG/COUNT.
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

	var out []domain.FoodMerchantInfo
	for rows.Next() {
		var m domain.FoodMerchantInfo
		var jamBuka, jamTutup sql.NullString
		if err := rows.Scan(
			&m.ID, &m.Name, &m.Address, &m.IsOpen, &m.VerificationStatus,
			&m.Lat, &m.Lng, &jamBuka, &jamTutup, &m.DistanceKM, &m.AvgRating, &m.RatingCount,
		); err != nil {
			return nil, err
		}
		if jamBuka.Valid {
			m.JamBuka = &jamBuka.String
		}
		if jamTutup.Valid {
			m.JamTutup = &jamTutup.String
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// GetFoodMerchantMenu — FOOD-BIKE-055/056: daftar menu merchant.
func (r *foodRepo) GetFoodMerchantMenu(ctx context.Context, merchantID string) ([]domain.FoodMenuItemInfo, error) {
	rows, err := r.readDB.QueryContext(ctx, `
		SELECT id::text, merchant_id::text, nama, harga, is_available, prep_time_minutes, kategori, foto
		FROM merchant_menu_items
		WHERE merchant_id = $1 AND is_available = TRUE
		ORDER BY kategori NULLS LAST, nama ASC`,
		merchantID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []domain.FoodMenuItemInfo
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
	}
	return out, rows.Err()
}

// GetPendingMerchantFoodOrders — order food pending_merchant yang belum direspon
// merchant melebihi timeout (FOOD-BIKE-022: 3 menit) → kandidat auto-cancel.
// updated_at di-update oleh UpdateStatus saat transisi ke pending_merchant,
// jadi dihitung dari sana.
func (r *foodRepo) GetPendingMerchantFoodOrders(ctx context.Context, timeout time.Duration) ([]*domain.Order, error) {
	rows, err := r.readDB.QueryContext(ctx, `
		SELECT id::text
		FROM orders
		WHERE service_sub_type = 'food_delivery'
		  AND status = 'pending_merchant'
		  AND updated_at <= NOW() - ($1 * INTERVAL '1 second')`,
		int(timeout.Seconds()),
	)
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
