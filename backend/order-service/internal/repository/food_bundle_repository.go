package repository

import (
	"context"
	"database/sql"
	"fmt"
	"tembus/order-service/internal/domain"
)

type foodBundleRepository struct{ db *sql.DB }

func NewFoodBundleRepository(db *sql.DB) domain.FoodBundleRepository {
	return &foodBundleRepository{db: db}
}

func (r *foodBundleRepository) CreateFoodBundle(ctx context.Context, bundle *domain.FoodMultiStoreBundle) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(ctx, `INSERT INTO food_multi_store_bundles (id, customer_id, status) VALUES ($1::uuid, $2::uuid, $3)`, bundle.ID, bundle.CustomerID, bundle.Status); err != nil {
		return err
	}
	for i, merchantID := range bundle.MerchantIDs {
		if _, err = tx.ExecContext(ctx, `INSERT INTO food_multi_store_bundle_merchants (bundle_id, merchant_id, position) VALUES ($1::uuid, $2::uuid, $3)`, bundle.ID, merchantID, i); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (r *foodBundleRepository) GetFoodBundle(ctx context.Context, bundleID string) (*domain.FoodMultiStoreBundle, error) {
	b := &domain.FoodMultiStoreBundle{}
	err := r.db.QueryRowContext(ctx, `SELECT id::text, customer_id::text, status FROM food_multi_store_bundles WHERE id = $1::uuid`, bundleID).Scan(&b.ID, &b.CustomerID, &b.Status)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	rows, err := r.db.QueryContext(ctx, `SELECT merchant_id::text, COALESCE(order_id::text, '') FROM food_multi_store_bundle_merchants WHERE bundle_id = $1::uuid ORDER BY position`, bundleID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var merchantID, orderID string
		if err := rows.Scan(&merchantID, &orderID); err != nil {
			return nil, err
		}
		b.MerchantIDs = append(b.MerchantIDs, merchantID)
		if orderID != "" {
			b.OrderIDs = append(b.OrderIDs, orderID)
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	var settlement domain.FoodBundleSettlement
	err = r.db.QueryRowContext(ctx, `SELECT bundle_id::text, gross_total_idr, child_order_count, status FROM food_multi_store_bundle_settlements WHERE bundle_id = $1::uuid`, bundleID).Scan(&settlement.BundleID, &settlement.GrossTotalIDR, &settlement.ChildOrderCount, &settlement.Status)
	if err == nil {
		b.Settlement = &settlement
	} else if err != sql.ErrNoRows {
		return nil, err
	}
	return b, nil
}

func (r *foodBundleRepository) AttachFoodBundleOrder(ctx context.Context, bundleID, orderID, merchantID string) error {
	result, err := r.db.ExecContext(ctx, `UPDATE food_multi_store_bundle_merchants SET order_id = $3::uuid WHERE bundle_id = $1::uuid AND merchant_id = $2::uuid AND order_id IS NULL AND EXISTS (SELECT 1 FROM food_multi_store_bundles b WHERE b.id = $1::uuid AND b.status = 'open')`, bundleID, merchantID, orderID)
	if err != nil {
		return err
	}
	count, _ := result.RowsAffected()
	if count != 1 {
		return fmt.Errorf("merchant slot is already assigned or bundle is closed")
	}
	return nil
}

func (r *foodBundleRepository) FinalizeFoodBundle(ctx context.Context, bundleID, customerID string, settlement domain.FoodBundleSettlement) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var status string
	if err = tx.QueryRowContext(ctx, `SELECT status FROM food_multi_store_bundles WHERE id = $1::uuid AND customer_id = $2::uuid FOR UPDATE`, bundleID, customerID).Scan(&status); err == sql.ErrNoRows {
		return domain.ErrNotFound
	}
	if err != nil {
		return err
	}
	if status != domain.FoodBundleOpen {
		return fmt.Errorf("bundle is already finalized")
	}
	if _, err = tx.ExecContext(ctx, `UPDATE food_multi_store_bundles SET status = 'finalized', finalized_at = NOW() WHERE id = $1::uuid`, bundleID); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO food_multi_store_bundle_settlements (bundle_id, gross_total_idr, child_order_count, status) VALUES ($1::uuid, $2, $3, $4)`, bundleID, settlement.GrossTotalIDR, settlement.ChildOrderCount, settlement.Status); err != nil {
		return err
	}
	return tx.Commit()
}
