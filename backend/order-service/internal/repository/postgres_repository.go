package repository

import (
	"context"
	"database/sql"
	"lancar/order-service/internal/domain"
	"time"
)

type postgresRepo struct {
	db     *sql.DB // writer
	readDB *sql.DB // reader
}

func NewPostgresRepository(db, readDB *sql.DB) *postgresRepo {
	return &postgresRepo{
		db:     db,
		readDB: readDB,
	}
}

// Pricing Repository Implementation
func (r *postgresRepo) GetActiveConfig(ctx context.Context) (*domain.PricingConfig, error) {
	query := `SELECT id, base_fare, per_km_fare, per_kg_fare, min_fare, volumetric_div 
			  FROM pricing_configs WHERE is_active = true LIMIT 1`
	
	config := &domain.PricingConfig{}
	var id string
	err := r.readDB.QueryRowContext(ctx, query).Scan(
		&id, &config.BaseFare, &config.PricePerKM, &config.PricePerMin, &config.VolumetricDiv, &config.VolumetricDiv,
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
				dispatch_expiry, created_at, updated_at
			  ) VALUES (
				$1, $2, $3, $4, $5, 
				ST_SetSRID(ST_MakePoint($6, $7), 4326), $8, 
				ST_SetSRID(ST_MakePoint($9, $10), 4326), $11, 
				$12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22
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
		o.DispatchExpiry, o.CreatedAt, o.UpdatedAt,
	)
	return err
}

func (r *postgresRepo) GetByID(ctx context.Context, id string) (*domain.Order, error) {
	query := `SELECT 
				id, order_number, customer_id, model, status, 
				ST_Y(pickup_location::geometry), ST_X(pickup_location::geometry), pickup_address, 
				ST_Y(dropoff_location::geometry), ST_X(dropoff_location::geometry), dropoff_address, 
				distance_km, base_price_idr, volumetric_surcharge_idr, 
				dynamic_price_idr, total_price_idr, handover_token, dispatch_expiry, created_at, updated_at
			  FROM orders WHERE id = $1`
	
	o := &domain.Order{}
	err := r.readDB.QueryRowContext(ctx, query, id).Scan(
		&o.ID, &o.OrderNumber, &o.CustomerID, &o.Model, &o.Status,
		&o.PickupLat, &o.PickupLng, &o.PickupAddress,
		&o.DropoffLat, &o.DropoffLng, &o.DropoffAddress,
		&o.DistanceKM, &o.BasePriceIDR, &o.VolumetricSurchargeIDR,
		&o.DynamicPriceIDR, &o.TotalPriceIDR, &o.HandoverToken, &o.DispatchExpiry, &o.CreatedAt, &o.UpdatedAt,
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
				dynamic_price_idr, total_price_idr, handover_token, dispatch_expiry, created_at, updated_at
			  FROM orders WHERE customer_id = $1 ORDER BY created_at DESC`
	
	rows, err := r.readDB.QueryContext(ctx, query, userID)
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
			&o.DynamicPriceIDR, &o.TotalPriceIDR, &o.HandoverToken, &o.DispatchExpiry, &o.CreatedAt, &o.UpdatedAt,
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

func (r *postgresRepo) AssignCourier(ctx context.Context, orderID string, courierID string) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Check if order is still searching
	var status domain.OrderStatus
	err = tx.QueryRowContext(ctx, "SELECT status FROM orders WHERE id = $1 FOR UPDATE", orderID).Scan(&status)
	if err != nil {
		return err
	}

	if status != domain.StatusSearching {
		return sql.ErrNoRows // Or a custom error like "Order already assigned"
	}

	query := `UPDATE orders SET courier_id = $1, status = 'assigned', updated_at = NOW(), dispatch_expiry = NULL WHERE id = $2`
	_, err = tx.ExecContext(ctx, query, courierID, orderID)
	if err != nil {
		return err
	}

	return tx.Commit()
}

func (r *postgresRepo) SetDispatchExpiry(ctx context.Context, orderID string, expiry time.Time) error {
	query := `UPDATE orders SET dispatch_expiry = $1, updated_at = NOW() WHERE id = $2`
	_, err := r.db.ExecContext(ctx, query, expiry, orderID)
	return err
}

func (r *postgresRepo) GetActiveCourierOrder(ctx context.Context, courierID string) (string, error) {
	query := `SELECT id FROM orders WHERE courier_id = $1 AND status IN ('assigned', 'picked_up', 'in_transit') LIMIT 1`
	var orderID string
	err := r.readDB.QueryRowContext(ctx, query, courierID).Scan(&orderID)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return orderID, err
}

func (r *postgresRepo) GetPendingAssignmentOrders(ctx context.Context, threshold time.Duration) ([]*domain.Order, error) {
	query := `SELECT 
				id, order_number, customer_id, model, status, 
				ST_Y(pickup_location::geometry), ST_X(pickup_location::geometry), pickup_address, 
				ST_Y(dropoff_location::geometry), ST_X(dropoff_location::geometry), dropoff_address, 
				distance_km, base_price_idr, volumetric_surcharge_idr, 
				dynamic_price_idr, total_price_idr, handover_token, dispatch_expiry, created_at, updated_at
			  FROM orders 
			  WHERE status = 'searching' AND updated_at < $1`
	
	thresholdTime := time.Now().Add(-threshold)
	rows, err := r.readDB.QueryContext(ctx, query, thresholdTime)
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
			&o.DynamicPriceIDR, &o.TotalPriceIDR, &o.HandoverToken, &o.DispatchExpiry, &o.CreatedAt, &o.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		orders = append(orders, o)
	}
	return orders, nil
}

// Order Event Repository Implementation
func (r *postgresRepo) SaveEvent(ctx context.Context, e domain.OrderEvent) error {
	query := `INSERT INTO order_events (order_id, user_id, status, message, created_at) 
			  VALUES ($1, $2, $3, $4, $5)`
	
	_, err := r.db.ExecContext(ctx, query,
		e.OrderID, e.UserID, e.Status, e.Message, time.Now(),
	)
	return err
}

func (r *postgresRepo) ListEventsByUserID(ctx context.Context, userID string, since time.Time) ([]domain.OrderEvent, error) {
	query := `SELECT id, order_id, user_id, status, message, created_at 
			  FROM order_events WHERE user_id = $1 AND created_at > $2 ORDER BY created_at ASC`
	
	rows, err := r.readDB.QueryContext(ctx, query, userID, since)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	events := []domain.OrderEvent{}
	for rows.Next() {
		var e domain.OrderEvent
		err := rows.Scan(&e.ID, &e.OrderID, &e.UserID, &e.Status, &e.Message, &e.CreatedAt)
		if err != nil {
			return nil, err
		}
		events = append(events, e)
	}
	return events, nil
}

func (r *postgresRepo) ListEventsByOrderID(ctx context.Context, orderID string) ([]domain.OrderEvent, error) {
	query := `SELECT id, order_id, user_id, status, message, created_at 
			  FROM order_events WHERE order_id = $1 ORDER BY created_at ASC`
	
	rows, err := r.readDB.QueryContext(ctx, query, orderID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	events := []domain.OrderEvent{}
	for rows.Next() {
		var e domain.OrderEvent
		err := rows.Scan(&e.ID, &e.OrderID, &e.UserID, &e.Status, &e.Message, &e.CreatedAt)
		if err != nil {
			return nil, err
		}
		events = append(events, e)
	}
	return events, nil
}

func (r *postgresRepo) ListMeetingPoints(ctx context.Context, lat, lng float64, radiusKM float64) ([]domain.MeetingPoint, error) {
	query := `
		SELECT id, name, ST_Y(location::geometry), ST_X(location::geometry), category, address, is_active, created_at, updated_at
		FROM meeting_points
		WHERE is_active = true
		AND ST_DWithin(
			location,
			ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
			$3 * 1000
		)
	`
	rows, err := r.db.QueryContext(ctx, query, lng, lat, radiusKM)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var mps []domain.MeetingPoint
	for rows.Next() {
		var mp domain.MeetingPoint
		if err := rows.Scan(&mp.ID, &mp.Name, &mp.Latitude, &mp.Longitude, &mp.Category, &mp.Address, &mp.IsActive, &mp.CreatedAt, &mp.UpdatedAt); err != nil {
			return nil, err
		}
		mps = append(mps, mp)
	}
	return mps, nil
}

func (r *postgresRepo) CreateMeetingPoint(ctx context.Context, mp *domain.MeetingPoint) error {
	query := `
		INSERT INTO meeting_points (id, name, location, category, address, is_active, created_at, updated_at)
		VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326), $5, $6, $7, NOW(), NOW())
	`
	_, err := r.db.ExecContext(ctx, query, mp.ID, mp.Name, mp.Longitude, mp.Latitude, mp.Category, mp.Address, mp.IsActive)
	return err
}

func (r *postgresRepo) UpdateMeetingPoint(ctx context.Context, mp *domain.MeetingPoint) error {
	query := `
		UPDATE meeting_points
		SET name = $2, location = ST_SetSRID(ST_MakePoint($3, $4), 4326), category = $5, address = $6, is_active = $7, updated_at = NOW()
		WHERE id = $1
	`
	_, err := r.db.ExecContext(ctx, query, mp.ID, mp.Name, mp.Longitude, mp.Latitude, mp.Category, mp.Address, mp.IsActive)
	return err
}


func (r *postgresRepo) DeleteMeetingPoint(ctx context.Context, id string) error {
	query := `DELETE FROM meeting_points WHERE id = $1`
	_, err := r.db.ExecContext(ctx, query, id)
	return err
}

func (r *postgresRepo) GetMeetingPointAnalytics(ctx context.Context) ([]domain.MeetingPointAnalytics, error) {
	query := `
		SELECT mp.id, mp.name, COUNT(o.id) as usage_count, COALESCE(AVG(EXTRACT(EPOCH FROM (o.updated_at - o.created_at))/60), 0) as avg_wait_time
		FROM meeting_points mp
		LEFT JOIN orders o ON o.meeting_point_id = mp.id
		GROUP BY mp.id, mp.name
		ORDER BY usage_count DESC
	`
	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var analytics []domain.MeetingPointAnalytics
	for rows.Next() {
		var a domain.MeetingPointAnalytics
		if err := rows.Scan(&a.MeetingPointID, &a.Name, &a.UsageCount, &a.AvgWaitTimeMin); err != nil {
			return nil, err
		}
		analytics = append(analytics, a)
	}
	return analytics, nil
}

func (r *postgresRepo) GetConfig(ctx context.Context) (*domain.PricingConfig, error) {
	return &domain.PricingConfig{
		BaseFare: 10000,
		PricePerKM: 2500,
		PricePerMin: 500,
		SurgeEnabled: true,
	}, nil
}

func (r *postgresRepo) UpdateConfig(ctx context.Context, config *domain.PricingConfig) error {
	// Placeholder implementation
	return nil
}
