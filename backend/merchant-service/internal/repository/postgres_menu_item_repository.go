package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

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

const menuItemColumns = `id, merchant_id, nama, harga, foto, kategori, prep_time_minutes, is_available, created_at, updated_at`

func scanMenuItem(row interface{ Scan(...any) error }) (*domain.MenuItem, error) {
	var item domain.MenuItem
	var foto sql.NullString
	err := row.Scan(
		&item.ID, &item.MerchantID, &item.Nama, &item.Harga, &foto,
		&item.Kategori, &item.PrepTimeMinutes, &item.IsAvailable,
		&item.CreatedAt, &item.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	if foto.Valid {
		item.Foto = &foto.String
	}
	return &item, nil
}

func (r *postgresMenuItemRepository) Create(ctx context.Context, item *domain.MenuItem) error {
	var foto sql.NullString
	if item.Foto != nil {
		foto = sql.NullString{String: *item.Foto, Valid: true}
	}
	err := r.db.QueryRowContext(ctx, `
		INSERT INTO merchant_menu_items (id, merchant_id, nama, harga, foto, kategori, prep_time_minutes, is_available)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING created_at, updated_at`,
		item.ID, item.MerchantID, item.Nama, item.Harga, foto, item.Kategori, item.PrepTimeMinutes, item.IsAvailable,
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
	var foto sql.NullString
	if item.Foto != nil {
		foto = sql.NullString{String: *item.Foto, Valid: true}
	}
	_, err := r.db.ExecContext(ctx, `
		UPDATE merchant_menu_items SET
			nama = COALESCE(NULLIF($3, ''), nama),
			harga = CASE WHEN $4 = 0 THEN harga ELSE $4 END,
			foto = CASE WHEN $5::text IS NULL THEN foto ELSE $5 END,
			kategori = COALESCE(NULLIF($6, ''), kategori),
			prep_time_minutes = CASE WHEN $7 = 0 THEN prep_time_minutes ELSE $7 END,
			is_available = COALESCE($8, is_available),
			updated_at = NOW()
		WHERE id = $1 AND merchant_id = $2`,
		item.ID, item.MerchantID, item.Nama, item.Harga, foto, item.Kategori, item.PrepTimeMinutes, item.IsAvailable,
	)
	return err
}

func (r *postgresMenuItemRepository) SetAvailability(ctx context.Context, id, merchantID string, available bool) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE merchant_menu_items SET is_available = $3, updated_at = NOW()
		WHERE id = $1 AND merchant_id = $2`, id, merchantID, available)
	return err
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
