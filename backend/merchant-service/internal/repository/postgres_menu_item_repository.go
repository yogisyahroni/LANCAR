package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"tembus/merchant-service/internal/domain"
)

// postgresMenuItemRepository — implementasi domain.MenuItemRepository.
type postgresMenuItemRepository struct {
	db     *sql.DB
	readDB *sql.DB
}

func NewPostgresMenuItemRepository(db, readDB *sql.DB) domain.MenuItemRepository {
	return &postgresMenuItemRepository{db: db, readDB: readDB}
}

const menuItemColumns = `id, merchant_id, nama, harga, foto, deskripsi, kategori, prep_time_minutes, is_available,
	stock_quantity, daily_sales_limit, daily_sales_count, sales_limit_reset_at, created_at, updated_at`

func scanMenuItem(row interface{ Scan(...any) error }) (*domain.MenuItem, error) {
	var item domain.MenuItem
	var foto, deskripsi sql.NullString
	var stockQuantity, dailySalesLimit sql.NullInt64
	var salesResetAt sql.NullTime
	err := row.Scan(
		&item.ID, &item.MerchantID, &item.Nama, &item.Harga, &foto, &deskripsi,
		&item.Kategori, &item.PrepTimeMinutes, &item.IsAvailable, &stockQuantity,
		&dailySalesLimit, &item.DailySalesCount, &salesResetAt,
		&item.CreatedAt, &item.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	if foto.Valid {
		item.Foto = &foto.String
	}
	if deskripsi.Valid {
		item.Deskripsi = &deskripsi.String
	}
	if stockQuantity.Valid {
		value := int(stockQuantity.Int64)
		item.StockQuantity = &value
	}
	if dailySalesLimit.Valid {
		value := int(dailySalesLimit.Int64)
		item.DailySalesLimit = &value
	}
	if salesResetAt.Valid {
		item.SalesResetAt = &salesResetAt.Time
	}
	return &item, nil
}

func (r *postgresMenuItemRepository) Create(ctx context.Context, item *domain.MenuItem) error {
	var foto, deskripsi sql.NullString
	if item.Foto != nil {
		foto = sql.NullString{String: *item.Foto, Valid: true}
	}
	if item.Deskripsi != nil {
		deskripsi = sql.NullString{String: *item.Deskripsi, Valid: true}
	}
	err := r.db.QueryRowContext(ctx, `
		INSERT INTO merchant_menu_items (id, merchant_id, nama, harga, foto, deskripsi, kategori, prep_time_minutes, is_available,
			stock_quantity, daily_sales_limit, daily_sales_count, sales_limit_reset_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::int, $11::int, $12, $13::timestamptz)
		RETURNING created_at, updated_at`,
		item.ID, item.MerchantID, item.Nama, item.Harga, foto, deskripsi, item.Kategori, item.PrepTimeMinutes, item.IsAvailable,
		item.StockQuantity, item.DailySalesLimit, item.DailySalesCount, item.SalesResetAt,
	).Scan(&item.CreatedAt, &item.UpdatedAt)
	return err
}

func (r *postgresMenuItemRepository) GetByID(ctx context.Context, id string) (*domain.MenuItem, error) {
	row := r.readDB.QueryRowContext(ctx, `SELECT `+menuItemColumns+` FROM merchant_menu_items WHERE id = $1`, id)
	item, err := scanMenuItem(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return item, err
}

func (r *postgresMenuItemRepository) ListByMerchant(ctx context.Context, merchantID string, limit, offset int) ([]*domain.MenuItem, error) {
	rows, err := r.readDB.QueryContext(ctx, `
		SELECT `+menuItemColumns+` FROM merchant_menu_items
		WHERE merchant_id = $1
		ORDER BY kategori, nama
		LIMIT $2 OFFSET $3`, merchantID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []*domain.MenuItem{}
	for rows.Next() {
		item, err := scanMenuItem(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func (r *postgresMenuItemRepository) Update(ctx context.Context, item *domain.MenuItem) error {
	var foto, deskripsi sql.NullString
	if item.Foto != nil {
		foto = sql.NullString{String: *item.Foto, Valid: true}
	}
	if item.Deskripsi != nil {
		deskripsi = sql.NullString{String: *item.Deskripsi, Valid: true}
	}
	_, err := r.db.ExecContext(ctx, `
		UPDATE merchant_menu_items SET
			nama = COALESCE(NULLIF($3, ''), nama),
			harga = CASE WHEN $4 = 0 THEN harga ELSE $4 END,
			foto = CASE WHEN $5::text IS NULL THEN foto ELSE $5 END,
			deskripsi = CASE WHEN $6::text IS NULL THEN deskripsi ELSE $6 END,
			kategori = COALESCE(NULLIF($7, ''), kategori),
			prep_time_minutes = CASE WHEN $8 = 0 THEN prep_time_minutes ELSE $8 END,
			is_available = COALESCE($9, is_available),
			stock_quantity = $10::int,
			daily_sales_limit = $11::int,
			daily_sales_count = $12,
			sales_limit_reset_at = $13::timestamptz,
			updated_at = NOW()
		WHERE id = $1 AND merchant_id = $2`,
		item.ID, item.MerchantID, item.Nama, item.Harga, foto, deskripsi, item.Kategori, item.PrepTimeMinutes, item.IsAvailable,
		item.StockQuantity, item.DailySalesLimit, item.DailySalesCount, item.SalesResetAt,
	)
	return err
}

func (r *postgresMenuItemRepository) SetAvailability(ctx context.Context, id, merchantID string, available bool) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE merchant_menu_items SET is_available = $3, updated_at = NOW()
		WHERE id = $1 AND merchant_id = $2`, id, merchantID, available)
	return err
}

func (r *postgresMenuItemRepository) UpdateInventory(ctx context.Context, id, merchantID string, stockQuantity *int, dailySalesLimit *int, resetAt *time.Time) error {
	result, err := r.db.ExecContext(ctx, `
		UPDATE merchant_menu_items SET
			stock_quantity = $3::int,
			daily_sales_limit = $4::int,
			daily_sales_count = CASE WHEN $4::int IS NULL THEN 0 ELSE LEAST(daily_sales_count, $4::int) END,
			sales_limit_reset_at = $5::timestamptz,
			is_available = CASE WHEN $3::int = 0 THEN FALSE ELSE is_available END,
			updated_at = NOW()
		WHERE id = $1 AND merchant_id = $2`, id, merchantID, stockQuantity, dailySalesLimit, resetAt)
	if err != nil {
		return err
	}
	if affected, _ := result.RowsAffected(); affected != 1 {
		return fmt.Errorf("menu item tidak ditemukan")
	}
	return nil
}

func (r *postgresMenuItemRepository) Delete(ctx context.Context, id, merchantID string) error {
	res, err := r.db.ExecContext(ctx, `
		DELETE FROM merchant_menu_items WHERE id = $1 AND merchant_id = $2`, id, merchantID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("menu item tidak ditemukan")
	}
	return nil
}

func (r *postgresMenuItemRepository) CountByMerchant(ctx context.Context, merchantID string) (int, error) {
	var n int
	err := r.readDB.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM merchant_menu_items WHERE merchant_id = $1`, merchantID).Scan(&n)
	return n, err
}

// ── FB-108: varian menu ──────────────────────────────────────────────────

// GetVariantsByMenuItem — grup varian + opsi milik menu item (dengan
// validasi kepemilikan merchant: menu item harus milik merchantID).
func (r *postgresMenuItemRepository) GetVariantsByMenuItem(ctx context.Context, menuItemID, merchantID string) ([]*domain.MenuItemVariant, error) {
	// Validasi kepemilikan dulu — menu item harus milik merchant ini.
	var owner string
	err := r.readDB.QueryRowContext(ctx,
		`SELECT merchant_id::text FROM merchant_menu_items WHERE id = $1`, menuItemID).Scan(&owner)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("menu item tidak ditemukan")
		}
		return nil, err
	}
	if owner != merchantID {
		return nil, fmt.Errorf("menu item bukan milik merchant ini")
	}

	rows, err := r.readDB.QueryContext(ctx, `
		SELECT id::text, menu_item_id::text, nama, is_required, min_select, max_select
		FROM menu_item_variants
		WHERE menu_item_id = $1
		ORDER BY sort_order ASC, created_at ASC`, menuItemID)
	if err != nil {
		return nil, fmt.Errorf("query menu_item_variants: %w", err)
	}
	defer rows.Close()

	var variants []*domain.MenuItemVariant
	var variantIDs []string
	for rows.Next() {
		v := &domain.MenuItemVariant{}
		if err := rows.Scan(&v.ID, &v.MenuItemID, &v.Nama, &v.IsRequired, &v.MinSelect, &v.MaxSelect); err != nil {
			return nil, err
		}
		v.Options = []domain.MenuItemVariantOption{}
		variants = append(variants, v)
		variantIDs = append(variantIDs, v.ID)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(variants) == 0 {
		return []*domain.MenuItemVariant{}, nil
	}

	// Ambil semua opsi sekaligus
	placeholders := make([]string, len(variantIDs))
	args := make([]any, len(variantIDs))
	for i, id := range variantIDs {
		placeholders[i] = fmt.Sprintf("$%d", i+1)
		args[i] = id
	}
	optRows, err := r.readDB.QueryContext(ctx, fmt.Sprintf(`
		SELECT id::text, variant_id::text, nama, price_delta, is_default
		FROM menu_item_variant_options
		WHERE variant_id IN (%s)
		ORDER BY created_at ASC`, strings.Join(placeholders, ", ")), args...)
	if err != nil {
		return nil, fmt.Errorf("query menu_item_variant_options: %w", err)
	}
	defer optRows.Close()

	byVariant := make(map[string][]domain.MenuItemVariantOption)
	for optRows.Next() {
		var o domain.MenuItemVariantOption
		if err := optRows.Scan(&o.ID, &o.VariantID, &o.Nama, &o.PriceDelta, &o.IsDefault); err != nil {
			return nil, err
		}
		byVariant[o.VariantID] = append(byVariant[o.VariantID], o)
	}
	if err := optRows.Err(); err != nil {
		return nil, err
	}
	for _, v := range variants {
		v.Options = byVariant[v.ID]
	}
	return variants, nil
}

// ReplaceVariants — replace semua varian menu item dalam SATU transaksi:
// validasi kepemilikan → DELETE lama (CASCADE hapus opsi) → INSERT baru.
func (r *postgresMenuItemRepository) ReplaceVariants(ctx context.Context, menuItemID, merchantID string, variants []*domain.MenuItemVariant) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	var owner string
	err = tx.QueryRowContext(ctx,
		`SELECT merchant_id::text FROM merchant_menu_items WHERE id = $1 FOR UPDATE`, menuItemID).Scan(&owner)
	if err != nil {
		if err == sql.ErrNoRows {
			return fmt.Errorf("menu item tidak ditemukan")
		}
		return err
	}
	if owner != merchantID {
		return fmt.Errorf("menu item bukan milik merchant ini")
	}

	if _, err := tx.ExecContext(ctx,
		`DELETE FROM menu_item_variants WHERE menu_item_id = $1`, menuItemID); err != nil {
		return fmt.Errorf("delete variants lama: %w", err)
	}

	for gi, v := range variants {
		if v.Nama == "" {
			return fmt.Errorf("nama varian tidak boleh kosong")
		}
		if len(v.Options) == 0 {
			return fmt.Errorf("varian %q minimal punya 1 opsi", v.Nama)
		}
		var variantID string
		if err := tx.QueryRowContext(ctx, `
			INSERT INTO menu_item_variants (menu_item_id, nama, is_required, min_select, max_select, sort_order)
			VALUES ($1, $2, $3, $4, $5, $6) RETURNING id::text`,
			menuItemID, v.Nama, v.IsRequired, v.MinSelect, v.MaxSelect, gi,
		).Scan(&variantID); err != nil {
			return fmt.Errorf("insert variant %q: %w", v.Nama, err)
		}
		for _, o := range v.Options {
			if o.Nama == "" {
				return fmt.Errorf("nama opsi tidak boleh kosong")
			}
			if o.PriceDelta < 0 {
				return fmt.Errorf("price_delta tidak boleh negatif")
			}
			if _, err := tx.ExecContext(ctx, `
				INSERT INTO menu_item_variant_options (variant_id, nama, price_delta, is_default)
				VALUES ($1, $2, $3, $4)`,
				variantID, o.Nama, o.PriceDelta, o.IsDefault,
			); err != nil {
				return fmt.Errorf("insert option %q: %w", o.Nama, err)
			}
		}
	}

	return tx.Commit()
}
