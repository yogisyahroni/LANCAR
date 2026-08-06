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
