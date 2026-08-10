package repository

import (
	"context"
	"database/sql"
	"errors"
	"strconv"
	"time"

	"tembus/merchant-service/internal/domain"
)

// postgresMerchantPromoRepository — impl MerchantPromoRepository (FB-099).
type postgresMerchantPromoRepository struct {
	writeDB *sql.DB
	readDB  *sql.DB
}

// NewPostgresMerchantPromoRepository buat repository promo merchant.
func NewPostgresMerchantPromoRepository(writeDB, readDB *sql.DB) domain.MerchantPromoRepository {
	return &postgresMerchantPromoRepository{writeDB: writeDB, readDB: readDB}
}

const promoColumns = `id::text, merchant_id::text, menu_item_id::text, discount_type,
	discount_value, max_discount_idr, starts_at, ends_at, is_active, created_at, updated_at`

func scanPromo(row interface{ Scan(...any) error }) (*domain.MerchantPromo, error) {
	var p domain.MerchantPromo
	var menuItemID, maxDiscount sql.NullString
	err := row.Scan(
		&p.ID, &p.MerchantID, &menuItemID, &p.DiscountType,
		&p.DiscountValue, &maxDiscount, &p.StartsAt, &p.EndsAt, &p.IsActive,
		&p.CreatedAt, &p.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	if menuItemID.Valid {
		v := menuItemID.String
		p.MenuItemID = &v
	}
	if maxDiscount.Valid && maxDiscount.String != "" {
		v, err := strconv.ParseInt(maxDiscount.String, 10, 64)
		if err == nil {
			p.MaxDiscountIDR = &v
		}
	}
	return &p, nil
}

func (r *postgresMerchantPromoRepository) Create(ctx context.Context, p *domain.MerchantPromo) error {
	var menuItemID, maxDiscount any
	if p.MenuItemID != nil {
		menuItemID = *p.MenuItemID
	}
	if p.MaxDiscountIDR != nil {
		maxDiscount = *p.MaxDiscountIDR
	}
	_, err := r.writeDB.ExecContext(ctx, `
		INSERT INTO merchant_promos
			(id, merchant_id, menu_item_id, discount_type, discount_value,
			 max_discount_idr, starts_at, ends_at, is_active)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
		p.ID, p.MerchantID, menuItemID, p.DiscountType, p.DiscountValue,
		maxDiscount, p.StartsAt, p.EndsAt, p.IsActive,
	)
	return err
}

func (r *postgresMerchantPromoRepository) GetByID(ctx context.Context, id, merchantID string) (*domain.MerchantPromo, error) {
	row := r.readDB.QueryRowContext(ctx,
		`SELECT `+promoColumns+` FROM merchant_promos WHERE id = $1 AND merchant_id = $2`,
		id, merchantID,
	)
	p, err := scanPromo(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, errors.New("promo tidak ditemukan")
	}
	return p, err
}

func (r *postgresMerchantPromoRepository) ListByMerchant(ctx context.Context, merchantID string, limit, offset int) ([]*domain.MerchantPromo, int, error) {
	rows, err := r.readDB.QueryContext(ctx,
		`SELECT `+promoColumns+` FROM merchant_promos
		 WHERE merchant_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
		merchantID, limit, offset,
	)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	out := []*domain.MerchantPromo{}
	for rows.Next() {
		p, err := scanPromo(rows)
		if err != nil {
			return nil, 0, err
		}
		out = append(out, p)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	var total int
	if err := r.readDB.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM merchant_promos WHERE merchant_id = $1`, merchantID,
	).Scan(&total); err != nil {
		return nil, 0, err
	}
	return out, total, nil
}

func (r *postgresMerchantPromoRepository) Update(ctx context.Context, p *domain.MerchantPromo) error {
	var menuItemID, maxDiscount any
	if p.MenuItemID != nil {
		menuItemID = *p.MenuItemID
	}
	if p.MaxDiscountIDR != nil {
		maxDiscount = *p.MaxDiscountIDR
	}
	_, err := r.writeDB.ExecContext(ctx, `
		UPDATE merchant_promos SET
			menu_item_id = $3, discount_type = $4, discount_value = $5,
			max_discount_idr = $6, starts_at = $7, ends_at = $8,
			is_active = $9, updated_at = NOW()
		WHERE id = $1 AND merchant_id = $2`,
		p.ID, p.MerchantID, menuItemID, p.DiscountType, p.DiscountValue,
		maxDiscount, p.StartsAt, p.EndsAt, p.IsActive,
	)
	return err
}

func (r *postgresMerchantPromoRepository) SetActive(ctx context.Context, id, merchantID string, active bool) error {
	res, err := r.writeDB.ExecContext(ctx,
		`UPDATE merchant_promos SET is_active = $3, updated_at = NOW()
		 WHERE id = $1 AND merchant_id = $2`,
		id, merchantID, active,
	)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return errors.New("promo tidak ditemukan")
	}
	return nil
}

func (r *postgresMerchantPromoRepository) Delete(ctx context.Context, id, merchantID string) error {
	res, err := r.writeDB.ExecContext(ctx,
		`DELETE FROM merchant_promos WHERE id = $1 AND merchant_id = $2`,
		id, merchantID,
	)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return errors.New("promo tidak ditemukan")
	}
	return nil
}

func (r *postgresMerchantPromoRepository) ListActiveByMerchant(ctx context.Context, merchantID string, now time.Time) ([]*domain.MerchantPromo, error) {
	rows, err := r.readDB.QueryContext(ctx,
		`SELECT `+promoColumns+` FROM merchant_promos
		 WHERE merchant_id = $1 AND is_active = TRUE
		   AND starts_at <= $2 AND ends_at > $2
		 ORDER BY created_at DESC`,
		merchantID, now,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []*domain.MerchantPromo{}
	for rows.Next() {
		p, err := scanPromo(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}
