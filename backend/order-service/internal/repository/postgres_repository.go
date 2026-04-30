package repository

import (
	"context"
	"database/sql"
	"lancar/order-service/internal/domain"
	"time"
)

type postgresRepo struct {
	db *sql.DB
}

func NewPostgresRepository(db *sql.DB) *postgresRepo {
	return &postgresRepo{db: db}
}

// Pricing Repository Implementation
func (r *postgresRepo) GetActiveConfig(ctx context.Context) (*domain.PricingConfig, error) {
	query := `SELECT id, base_fare, per_km_fare, per_kg_fare, min_fare, volumetric_div 
			  FROM pricing_configs WHERE is_active = true LIMIT 1`
	
	config := &domain.PricingConfig{}
	err := r.db.QueryRowContext(ctx, query).Scan(
		&config.ID, &config.BaseFare, &config.PerKMFare, &config.PerKGFare, &config.MinFare, &config.VolumetricDiv,
	)
	if err != nil {
		return nil, err
	}
	return config, nil
}

// Order Repository Implementation
func (r *postgresRepo) Create(ctx context.Context, o *domain.Order) error {
	query := `INSERT INTO orders (
				id, order_number, customer_id, model, status, 
				pickup_location, pickup_address, 
				dropoff_location, dropoff_address, 
				distance_km, base_price_idr, volumetric_surcharge_idr, 
				dynamic_price_idr, total_price_idr, ppn_idr, mdr_idr, handover_token,
				created_at, updated_at
			  ) VALUES (
				$1, $2, $3, $4, $5, 
				ST_SetSRID(ST_MakePoint($6, $7), 4326), $8, 
				ST_SetSRID(ST_MakePoint($9, $10), 4326), $11, 
				$12, $13, $14, $15, $16, $17, $18, $19, $20, $21
			  )`
	
	// Default tax/fee for now
	ppn := int64(float64(o.TotalPriceIDR) * 0.11)
	mdr := int64(2500) // flat fee for example

	_, err := r.db.ExecContext(ctx, query,
		o.ID, o.OrderNumber, o.CustomerID, o.Model, o.Status,
		o.PickupLng, o.PickupLat, o.PickupAddress,
		o.DropoffLng, o.DropoffLat, o.DropoffAddress,
		o.DistanceKM, o.BasePriceIDR, o.VolumetricSurchargeIDR,
		o.DynamicPriceIDR, o.TotalPriceIDR, ppn, mdr, o.HandoverToken,
		o.CreatedAt, o.UpdatedAt,
	)
	return err
}

func (r *postgresRepo) GetByID(ctx context.Context, id string) (*domain.Order, error) {
	query := `SELECT 
				id, order_number, customer_id, model, status, 
				ST_Y(pickup_location::geometry), ST_X(pickup_location::geometry), pickup_address, 
				ST_Y(dropoff_location::geometry), ST_X(dropoff_location::geometry), dropoff_address, 
				distance_km, base_price_idr, volumetric_surcharge_idr, 
				dynamic_price_idr, total_price_idr, handover_token, created_at, updated_at
			  FROM orders WHERE id = $1`
	
	o := &domain.Order{}
	err := r.db.QueryRowContext(ctx, query, id).Scan(
		&o.ID, &o.OrderNumber, &o.CustomerID, &o.Model, &o.Status,
		&o.PickupLat, &o.PickupLng, &o.PickupAddress,
		&o.DropoffLat, &o.DropoffLng, &o.DropoffAddress,
		&o.DistanceKM, &o.BasePriceIDR, &o.VolumetricSurchargeIDR,
		&o.DynamicPriceIDR, &o.TotalPriceIDR, &o.HandoverToken, &o.CreatedAt, &o.UpdatedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return o, nil
}

func (r *postgresRepo) ListByUserID(ctx context.Context, userID string, filter map[string]interface{}) ([]*domain.Order, error) {
	query := `SELECT 
				id, order_number, customer_id, model, status, 
				ST_Y(pickup_location::geometry), ST_X(pickup_location::geometry), pickup_address, 
				ST_Y(dropoff_location::geometry), ST_X(dropoff_location::geometry), dropoff_address, 
				distance_km, base_price_idr, volumetric_surcharge_idr, 
				dynamic_price_idr, total_price_idr, handover_token, created_at, updated_at
			  FROM orders WHERE customer_id = $1 ORDER BY created_at DESC`
	
	rows, err := r.db.QueryContext(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	orders := []*domain.Order{}
	for rows.Next() {
		o := &domain.Order{}
		err := rows.Scan(
			&o.ID, &o.OrderNumber, &o.CustomerID, &o.Model, &o.Status,
			&o.PickupLat, &o.PickupLng, &o.PickupAddress,
			&o.DropoffLat, &o.DropoffLng, &o.DropoffAddress,
			&o.DistanceKM, &o.BasePriceIDR, &o.VolumetricSurchargeIDR,
			&o.DynamicPriceIDR, &o.TotalPriceIDR, &o.HandoverToken, &o.CreatedAt, &o.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		orders = append(orders, o)
	}
	return orders, nil
}

func (r *postgresRepo) UpdateStatus(ctx context.Context, id string, status domain.OrderStatus) error {
	query := `UPDATE orders SET status = $1, updated_at = $2 WHERE id = $3`
	_, err := r.db.ExecContext(ctx, query, status, time.Now(), id)
	return err
}

func (r *postgresRepo) CancelExpiredOrders(ctx context.Context, timeout time.Duration) (int64, error) {
	query := `UPDATE orders 
			  SET status = 'cancelled', updated_at = NOW(), cancellation_reason = 'Payment timeout'
			  WHERE status = 'pending_payment' AND created_at < $1`
	
	expiryTime := time.Now().Add(-timeout)
	res, err := r.db.ExecContext(ctx, query, expiryTime)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}
