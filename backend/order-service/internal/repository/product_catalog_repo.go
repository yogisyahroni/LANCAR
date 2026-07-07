package repository

import (
	"context"
	"database/sql"
	"fmt"
	"tembus/order-service/internal/domain"
	"time"
)

type productCatalogRepo struct {
	db *sql.DB
}

func NewProductCatalogRepository(db *sql.DB) domain.ProductCatalogRepository {
	return &productCatalogRepo{db: db}
}

func (r *productCatalogRepo) Create(ctx context.Context, p *domain.ProductCatalog) error {
	query := `
		INSERT INTO product_catalogs (id, customer_id, name, sku, weight_kg, item_image, price, is_active, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
	`
	p.CreatedAt = time.Now().UTC()
	p.UpdatedAt = p.CreatedAt
	_, err := r.db.ExecContext(ctx, query,
		p.ID, p.CustomerID, p.Name, p.SKU, p.WeightKG, p.ItemImage, p.Price, p.IsActive, p.CreatedAt, p.UpdatedAt,
	)
	return err
}

func (r *productCatalogRepo) GetByID(ctx context.Context, id, customerID string) (*domain.ProductCatalog, error) {
	query := `
		SELECT id, customer_id, name, sku, weight_kg, item_image, price, is_active, created_at, updated_at
		FROM product_catalogs
		WHERE id = $1 AND customer_id = $2
	`
	var p domain.ProductCatalog
	err := r.db.QueryRowContext(ctx, query, id, customerID).Scan(
		&p.ID, &p.CustomerID, &p.Name, &p.SKU, &p.WeightKG, &p.ItemImage, &p.Price, &p.IsActive, &p.CreatedAt, &p.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *productCatalogRepo) List(ctx context.Context, req domain.ProductCatalogListRequest) (*domain.ProductCatalogListResponse, error) {
	searchQuery := ""
	args := []interface{}{req.CustomerID}
	argIdx := 2

	if req.Search != "" {
		searchQuery = fmt.Sprintf(" AND (name ILIKE $%d OR sku ILIKE $%d)", argIdx, argIdx)
		args = append(args, "%"+req.Search+"%")
		argIdx++
	}

	countQuery := `SELECT COUNT(*) FROM product_catalogs WHERE customer_id = $1` + searchQuery
	var total int
	err := r.db.QueryRowContext(ctx, countQuery, args...).Scan(&total)
	if err != nil {
		return nil, err
	}

	query := `
		SELECT id, customer_id, name, sku, weight_kg, item_image, price, is_active, created_at, updated_at
		FROM product_catalogs
		WHERE customer_id = $1` + searchQuery + `
		ORDER BY created_at DESC
		LIMIT $` + fmt.Sprintf("%d", argIdx) + ` OFFSET $` + fmt.Sprintf("%d", argIdx+1)
	
	args = append(args, req.Limit, req.Offset)

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []domain.ProductCatalog
	for rows.Next() {
		var p domain.ProductCatalog
		if err := rows.Scan(
			&p.ID, &p.CustomerID, &p.Name, &p.SKU, &p.WeightKG, &p.ItemImage, &p.Price, &p.IsActive, &p.CreatedAt, &p.UpdatedAt,
		); err != nil {
			return nil, err
		}
		items = append(items, p)
	}

	page := 1
	if req.Limit > 0 {
		page = (req.Offset / req.Limit) + 1
	}

	return &domain.ProductCatalogListResponse{
		Items:      items,
		TotalCount: total,
		Page:       page,
		Limit:      req.Limit,
	}, nil
}

func (r *productCatalogRepo) Update(ctx context.Context, p *domain.ProductCatalog) error {
	query := `
		UPDATE product_catalogs
		SET name = $1, sku = $2, weight_kg = $3, item_image = $4, price = $5, is_active = $6, updated_at = $7
		WHERE id = $8 AND customer_id = $9
	`
	p.UpdatedAt = time.Now().UTC()
	_, err := r.db.ExecContext(ctx, query,
		p.Name, p.SKU, p.WeightKG, p.ItemImage, p.Price, p.IsActive, p.UpdatedAt, p.ID, p.CustomerID,
	)
	return err
}

func (r *productCatalogRepo) Delete(ctx context.Context, id, customerID string) error {
	query := `DELETE FROM product_catalogs WHERE id = $1 AND customer_id = $2`
	_, err := r.db.ExecContext(ctx, query, id, customerID)
	return err
}

func (r *productCatalogRepo) GetCountByCustomerID(ctx context.Context, customerID string) (int, error) {
	var count int
	err := r.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM product_catalogs WHERE customer_id = $1`, customerID).Scan(&count)
	return count, err
}

func (r *productCatalogRepo) BulkCreate(ctx context.Context, products []domain.ProductCatalog) error {
	if len(products) == 0 {
		return nil
	}

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}

	stmt, err := tx.PrepareContext(ctx, `
		INSERT INTO product_catalogs (id, customer_id, name, sku, weight_kg, item_image, price, is_active, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
	`)
	if err != nil {
		tx.Rollback()
		return err
	}
	defer stmt.Close()

	for _, p := range products {
		if _, err := stmt.ExecContext(ctx, p.ID, p.CustomerID, p.Name, p.SKU, p.WeightKG, p.ItemImage, p.Price, p.IsActive, p.CreatedAt, p.UpdatedAt); err != nil {
			tx.Rollback()
			return err
		}
	}

	return tx.Commit()
}
