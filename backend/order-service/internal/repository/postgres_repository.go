package repository

import (
	"context"
	"database/sql"
	"fmt"
	"tembus/order-service/internal/domain"
	"time"
)

type postgresRepo struct {
	db         *sql.DB // writer
	readDB     *sql.DB // reader
	configRepo domain.ConfigRepository
}

func NewPostgresRepository(db, readDB *sql.DB, configRepo domain.ConfigRepository) *postgresRepo {
	return &postgresRepo{
		db:         db,
		readDB:     readDB,
		configRepo: configRepo,
	}
}

// Pricing Repository Implementation
func (r *postgresRepo) GetActiveConfig(ctx context.Context, model string) (*domain.PricingConfig, error) {
	if model == "" {
		return nil, fmt.Errorf("pricing model is required")
	}

	query := `
		SELECT
			base_fee,
			per_km_fee,
			price_per_min,
			surge_enabled,
			weather_multiplier,
			traffic_multiplier,
			volumetric_div
		FROM pricing_configs
		WHERE model = $1 AND COALESCE(is_active, TRUE) = TRUE
		ORDER BY updated_at DESC
		LIMIT 1
	`

	config := &domain.PricingConfig{}
	err := r.readDB.QueryRowContext(ctx, query, model).Scan(
		&config.BaseFare,
		&config.PricePerKM,
		&config.PricePerMin,
		&config.SurgeEnabled,
		&config.WeatherMultiplier,
		&config.TrafficMultiplier,
		&config.VolumetricDiv,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("active pricing config not found for model %s", model)
		}
		return nil, err
	}
	if config.BaseFare <= 0 || config.PricePerKM <= 0 || config.VolumetricDiv <= 0 {
		return nil, fmt.Errorf("invalid pricing config for model %s", model)
	}
	return config, nil
}

func (r *postgresRepo) GetDeliveryServiceByCode(ctx context.Context, code string) (*domain.DeliveryServiceProduct, error) {
	if code == "" {
		return nil, fmt.Errorf("delivery service code is required")
	}

	query := `
		SELECT
			code,
			name,
			base_fare_idr,
			per_km_idr,
			included_distance_km,
			uses_size_tier,
			max_distance_km,
			max_weight_kg
		FROM delivery_service_products
		WHERE code = $1 AND is_enabled = TRUE
		LIMIT 1
	`

	service := &domain.DeliveryServiceProduct{}
	err := r.readDB.QueryRowContext(ctx, query, code).Scan(
		&service.Code,
		&service.Name,
		&service.BaseFareIDR,
		&service.PerKmIDR,
		&service.IncludedDistanceKM,
		&service.UsesSizeTier,
		&service.MaxDistanceKM,
		&service.MaxWeightKG,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("active delivery service not found for code %s", code)
		}
		return nil, err
	}

	return service, nil
}


// Order Repository Implementation
func (r *postgresRepo) Create(ctx context.Context, o *domain.Order) error {
	query := `INSERT INTO orders (
				id, order_number, customer_id, model, status, 
				pickup_location, pickup_address, 
				dropoff_location, dropoff_address, 
				length, width, height, weight, item_description, item_image_url,
				distance_km, base_price_idr, volumetric_surcharge_idr, 
				dynamic_price_idr, total_price_idr, ppn_idr, mdr_idr, handover_token,
				dispatch_expiry, batch_id, sequence_no, created_at, updated_at
			  ) VALUES (
				$1, $2, $3, $4, $5, 
				ST_SetSRID(ST_MakePoint($6, $7), 4326), $8, 
				ST_SetSRID(ST_MakePoint($9, $10), 4326), $11, 
				$12, $13, $14, $15, $16, $17,
				$18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30
			  )`

	// Default tax/fee for now
	ppnRate := r.configRepo.GetFloatConfig(ctx, "payment_ppn_rate", 0.11)
	ppn := int64(float64(o.TotalPriceIDR) * ppnRate)
	
	mdrFixed := r.configRepo.GetIntConfig(ctx, "payment_mdr_fixed", 2500)
	mdr := int64(mdrFixed)

	_, err := r.db.ExecContext(ctx, query,
		o.ID, o.OrderNumber, o.CustomerID, o.Model, o.Status,
		o.PickupLng, o.PickupLat, o.PickupAddress,
		o.DropoffLng, o.DropoffLat, o.DropoffAddress,
		o.Length, o.Width, o.Height, o.Weight, o.ItemDescription, o.ItemImageURL,
		o.DistanceKM, o.BasePriceIDR, o.VolumetricSurchargeIDR,
		o.DynamicPriceIDR, o.TotalPriceIDR, ppn, mdr, o.HandoverToken,
		o.DispatchExpiry, o.BatchID, o.SequenceNo, o.CreatedAt, o.UpdatedAt,
	)
	return err
}

func (r *postgresRepo) GetByID(ctx context.Context, id string) (*domain.Order, error) {
	query := `SELECT 
				id, order_number, customer_id, model, status, 
				ST_Y(pickup_location::geometry), ST_X(pickup_location::geometry), pickup_address, 
				ST_Y(dropoff_location::geometry), ST_X(dropoff_location::geometry), dropoff_address, 
				length, width, height, weight, item_description, COALESCE(item_image_url, ''),
				distance_km, base_price_idr, volumetric_surcharge_idr, 
				dynamic_price_idr, total_price_idr, handover_token, dispatch_expiry, batch_id, sequence_no, courier_id, created_at, updated_at
			  FROM orders WHERE id = $1`

	o := &domain.Order{}
	err := r.readDB.QueryRowContext(ctx, query, id).Scan(
		&o.ID, &o.OrderNumber, &o.CustomerID, &o.Model, &o.Status,
		&o.PickupLat, &o.PickupLng, &o.PickupAddress,
		&o.DropoffLat, &o.DropoffLng, &o.DropoffAddress,
		&o.Length, &o.Width, &o.Height, &o.Weight, &o.ItemDescription, &o.ItemImageURL,
		&o.DistanceKM, &o.BasePriceIDR, &o.VolumetricSurchargeIDR,
		&o.DynamicPriceIDR, &o.TotalPriceIDR, &o.HandoverToken, &o.DispatchExpiry, &o.BatchID, &o.SequenceNo, &o.CourierID, &o.CreatedAt, &o.UpdatedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return o, nil
}

func (r *postgresRepo) GetByOrderNumber(ctx context.Context, orderNumber string) (*domain.Order, error) {
	query := `SELECT 
				id, order_number, customer_id, model, status, 
				ST_Y(pickup_location::geometry), ST_X(pickup_location::geometry), pickup_address, 
				ST_Y(dropoff_location::geometry), ST_X(dropoff_location::geometry), dropoff_address, 
				length, width, height, weight, item_description, COALESCE(item_image_url, ''),
				distance_km, base_price_idr, volumetric_surcharge_idr, 
				dynamic_price_idr, total_price_idr, handover_token, dispatch_expiry, batch_id, sequence_no, courier_id, created_at, updated_at
			  FROM orders WHERE order_number = $1`

	o := &domain.Order{}
	err := r.readDB.QueryRowContext(ctx, query, orderNumber).Scan(
		&o.ID, &o.OrderNumber, &o.CustomerID, &o.Model, &o.Status,
		&o.PickupLat, &o.PickupLng, &o.PickupAddress,
		&o.DropoffLat, &o.DropoffLng, &o.DropoffAddress,
		&o.Length, &o.Width, &o.Height, &o.Weight, &o.ItemDescription, &o.ItemImageURL,
		&o.DistanceKM, &o.BasePriceIDR, &o.VolumetricSurchargeIDR,
		&o.DynamicPriceIDR, &o.TotalPriceIDR, &o.HandoverToken, &o.DispatchExpiry, &o.BatchID, &o.SequenceNo, &o.CourierID, &o.CreatedAt, &o.UpdatedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return o, nil
}

func (r *postgresRepo) GetByBatchID(ctx context.Context, batchID string) ([]*domain.Order, error) {
	query := `
		SELECT
			id, order_number, customer_id, model, status,
			ST_Y(pickup_location::geometry), ST_X(pickup_location::geometry), pickup_address,
			ST_Y(dropoff_location::geometry), ST_X(dropoff_location::geometry), dropoff_address,
			length, width, height, weight, item_description, COALESCE(item_image_url, ''),
			distance_km, base_price_idr, volumetric_surcharge_idr,
			dynamic_price_idr, total_price_idr, handover_token, dispatch_expiry, batch_id, sequence_no, courier_id, created_at, updated_at
		FROM orders
		WHERE batch_id = $1
		ORDER BY sequence_no ASC
	`
	rows, err := r.readDB.QueryContext(ctx, query, batchID)
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
			&o.Length, &o.Width, &o.Height, &o.Weight, &o.ItemDescription, &o.ItemImageURL,
			&o.DistanceKM, &o.BasePriceIDR, &o.VolumetricSurchargeIDR,
			&o.DynamicPriceIDR, &o.TotalPriceIDR, &o.HandoverToken, &o.DispatchExpiry, &o.BatchID, &o.SequenceNo, &o.CourierID, &o.CreatedAt, &o.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		orders = append(orders, o)
	}
	return orders, nil
}

func (r *postgresRepo) ListByUserID(ctx context.Context, userID string, filter map[string]interface{}) ([]*domain.Order, error) {
	query := `SELECT 
				id, order_number, customer_id, model, status, 
				ST_Y(pickup_location::geometry), ST_X(pickup_location::geometry), pickup_address, 
				ST_Y(dropoff_location::geometry), ST_X(dropoff_location::geometry), dropoff_address, 
				length, width, height, weight, item_description, COALESCE(item_image_url, ''),
				distance_km, base_price_idr, volumetric_surcharge_idr, 
				dynamic_price_idr, total_price_idr, handover_token, dispatch_expiry, batch_id, sequence_no, courier_id, created_at, updated_at
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
			&o.Length, &o.Width, &o.Height, &o.Weight, &o.ItemDescription, &o.ItemImageURL,
			&o.DistanceKM, &o.BasePriceIDR, &o.VolumetricSurchargeIDR,
			&o.DynamicPriceIDR, &o.TotalPriceIDR, &o.HandoverToken, &o.DispatchExpiry, &o.BatchID, &o.SequenceNo, &o.CourierID, &o.CreatedAt, &o.UpdatedAt,
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

func (r *postgresRepo) UpdateDimensions(ctx context.Context, id string, length, width, height, weight float64) error {
	query := `UPDATE orders SET length = $1, width = $2, height = $3, weight = $4, updated_at = $5 WHERE id = $6`
	_, err := r.db.ExecContext(ctx, query, length, width, height, weight, time.Now(), id)
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
	var batchID *string
	err = tx.QueryRowContext(ctx, "SELECT status, batch_id FROM orders WHERE id = $1 FOR UPDATE", orderID).Scan(&status, &batchID)
	if err != nil {
		return err
	}

	if status != domain.StatusSearching {
		return sql.ErrNoRows // Or a custom error like "Order already assigned"
	}

	if batchID != nil && *batchID != "" {
		query := `UPDATE orders SET courier_id = $1, status = 'assigned', updated_at = NOW(), dispatch_expiry = NULL WHERE batch_id = $2 AND status = 'searching'`
		_, err = tx.ExecContext(ctx, query, courierID, *batchID)
		if err != nil {
			return err
		}
	} else {
		query := `UPDATE orders SET courier_id = $1, status = 'assigned', updated_at = NOW(), dispatch_expiry = NULL WHERE id = $2`
		_, err = tx.ExecContext(ctx, query, courierID, orderID)
		if err != nil {
			return err
		}
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
				length, width, height, weight, item_description, COALESCE(item_image_url, ''),
				distance_km, base_price_idr, volumetric_surcharge_idr, 
				dynamic_price_idr, total_price_idr, handover_token, dispatch_expiry, batch_id, sequence_no, courier_id, created_at, updated_at
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
			&o.Length, &o.Width, &o.Height, &o.Weight, &o.ItemDescription, &o.ItemImageURL,
			&o.DistanceKM, &o.BasePriceIDR, &o.VolumetricSurchargeIDR,
			&o.DynamicPriceIDR, &o.TotalPriceIDR, &o.HandoverToken, &o.DispatchExpiry, &o.BatchID, &o.SequenceNo, &o.CourierID, &o.CreatedAt, &o.UpdatedAt,
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
	return r.GetActiveConfig(ctx, "p2p")
}

func (r *postgresRepo) UpdateConfig(ctx context.Context, config *domain.PricingConfig) error {
	if config == nil {
		return fmt.Errorf("pricing config is required")
	}
	if config.BaseFare <= 0 || config.PricePerKM <= 0 || config.VolumetricDiv <= 0 {
		return fmt.Errorf("invalid pricing config")
	}

	query := `
		UPDATE pricing_configs
		SET base_fee = $1,
			per_km_fee = $2,
			price_per_min = $3,
			surge_enabled = $4,
			weather_multiplier = $5,
			traffic_multiplier = $6,
			volumetric_div = $7,
			updated_at = NOW()
		WHERE model = 'p2p' AND COALESCE(is_active, TRUE) = TRUE
	`
	result, err := r.db.ExecContext(
		ctx,
		query,
		config.BaseFare,
		config.PricePerKM,
		config.PricePerMin,
		config.SurgeEnabled,
		config.WeatherMultiplier,
		config.TrafficMultiplier,
		config.VolumetricDiv,
	)
	if err != nil {
		return err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return fmt.Errorf("active p2p pricing config not found")
	}
	return nil
}

func (r *postgresRepo) CheckCoverage(ctx context.Context, lat, lng float64) (bool, error) {
	var exists bool
	query := `SELECT EXISTS(SELECT 1 FROM zones WHERE is_active = true AND ST_Contains(polygon::geometry, ST_SetSRID(ST_MakePoint($2, $1), 4326)))`
	err := r.readDB.QueryRowContext(ctx, query, lat, lng).Scan(&exists)
	if err != nil {
		return false, err
	}
	return exists, nil
}

func (r *postgresRepo) SaveScan(ctx context.Context, scan *domain.PackageScan) error {
	query := `INSERT INTO package_scans (
				order_id, scan_type, scanned_by, latitude, longitude, warehouse_id, photo_url, bag_number
			  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			  RETURNING id, recorded_at`

	err := r.db.QueryRowContext(ctx, query,
		scan.OrderID, scan.ScanType, scan.ScannedBy, scan.Latitude, scan.Longitude, scan.WarehouseID, scan.PhotoURL, scan.BagNumber,
	).Scan(&scan.ID, &scan.RecordedAt)
	return err
}

func (r *postgresRepo) GetScansForOrder(ctx context.Context, orderID string) ([]*domain.PackageScan, error) {
	query := `SELECT id, order_id, scan_type, scanned_by, latitude, longitude, warehouse_id, photo_url, bag_number, recorded_at
			  FROM package_scans
			  WHERE order_id = $1
			  ORDER BY recorded_at ASC`

	rows, err := r.readDB.QueryContext(ctx, query, orderID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var scans []*domain.PackageScan
	for rows.Next() {
		scan := &domain.PackageScan{}
		err := rows.Scan(
			&scan.ID, &scan.OrderID, &scan.ScanType, &scan.ScannedBy,
			&scan.Latitude, &scan.Longitude, &scan.WarehouseID, &scan.PhotoURL, &scan.BagNumber, &scan.RecordedAt,
		)
		if err != nil {
			return nil, err
		}
		scans = append(scans, scan)
	}
	return scans, nil
}

func (r *postgresRepo) CreateConsolidationBag(ctx context.Context, bag *domain.ConsolidationBag) error {
	query := `INSERT INTO consolidation_bags (
				bag_number, vehicle_plate, flight_number, origin_warehouse_id, destination_warehouse_id, status, created_by
			  ) VALUES ($1, $2, $3, $4, $5, $6, $7)
			  RETURNING id, created_at, updated_at`

	err := r.db.QueryRowContext(ctx, query,
		bag.BagNumber, bag.VehiclePlate, bag.FlightNumber, bag.OriginWarehouseID, bag.DestinationWarehouseID, bag.Status, bag.CreatedBy,
	).Scan(&bag.ID, &bag.CreatedAt, &bag.UpdatedAt)
	return err
}

func (r *postgresRepo) GetConsolidationBag(ctx context.Context, bagNumber string) (*domain.ConsolidationBag, error) {
	query := `SELECT id, bag_number, vehicle_plate, flight_number, origin_warehouse_id, destination_warehouse_id, status, created_by, created_at, updated_at
			  FROM consolidation_bags
			  WHERE bag_number = $1`

	bag := &domain.ConsolidationBag{}
	err := r.readDB.QueryRowContext(ctx, query, bagNumber).Scan(
		&bag.ID, &bag.BagNumber, &bag.VehiclePlate, &bag.FlightNumber, &bag.OriginWarehouseID, &bag.DestinationWarehouseID, &bag.Status, &bag.CreatedBy, &bag.CreatedAt, &bag.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return bag, nil
}

func (r *postgresRepo) UpdateConsolidationBagStatus(ctx context.Context, bagNumber string, status string) error {
	query := `UPDATE consolidation_bags SET status = $1, updated_at = NOW() WHERE bag_number = $2`
	_, err := r.db.ExecContext(ctx, query, status, bagNumber)
	return err
}

func (r *postgresRepo) GetLatestScanForOrder(ctx context.Context, orderID string) (*domain.PackageScan, error) {
	query := `SELECT id, order_id, scan_type, scanned_by, latitude, longitude, warehouse_id, photo_url, bag_number, recorded_at
			  FROM package_scans
			  WHERE order_id = $1
			  ORDER BY recorded_at DESC
			  LIMIT 1`

	scan := &domain.PackageScan{}
	err := r.readDB.QueryRowContext(ctx, query, orderID).Scan(
		&scan.ID, &scan.OrderID, &scan.ScanType, &scan.ScannedBy,
		&scan.Latitude, &scan.Longitude, &scan.WarehouseID, &scan.PhotoURL, &scan.BagNumber, &scan.RecordedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return scan, nil
}

func (r *postgresRepo) GetScansByBagNumber(ctx context.Context, bagNumber string) ([]*domain.PackageScan, error) {
	query := `SELECT id, order_id, scan_type, scanned_by, latitude, longitude, warehouse_id, photo_url, bag_number, recorded_at
			  FROM package_scans
			  WHERE bag_number = $1
			  ORDER BY recorded_at ASC`

	rows, err := r.readDB.QueryContext(ctx, query, bagNumber)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var scans []*domain.PackageScan
	for rows.Next() {
		scan := &domain.PackageScan{}
		err := rows.Scan(
			&scan.ID, &scan.OrderID, &scan.ScanType, &scan.ScannedBy,
			&scan.Latitude, &scan.Longitude, &scan.WarehouseID, &scan.PhotoURL, &scan.BagNumber, &scan.RecordedAt,
		)
		if err != nil {
			return nil, err
		}
		scans = append(scans, scan)
	}
	return scans, nil
}

func (r *postgresRepo) GetCourierInfo(ctx context.Context, courierID string) (*domain.CourierInfo, error) {
	query := `
		SELECT 
			u.id, u.full_name, COALESCE(u.photo_url, ''),
			COALESCE(cp.vehicle_type, ''), COALESCE(cp.vehicle_plate, ''), COALESCE(cp.relay_score, 0)
		FROM users u
		LEFT JOIN courier_profiles cp ON u.id = cp.user_id
		WHERE u.id = $1
	`
	info := &domain.CourierInfo{}
	var fullName, photoURL, vehicleType, vehiclePlate string
	var relayScore float64
	var id string

	err := r.readDB.QueryRowContext(ctx, query, courierID).Scan(
		&id, &fullName, &photoURL, &vehicleType, &vehiclePlate, &relayScore,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	info.ID = id
	info.FullName = fullName
	info.ProfilePhotoURL = photoURL
	if len(fullName) > 0 {
		info.Initial = string(fullName[0])
	}
	info.VehicleType = vehicleType
	info.VehiclePlate = vehiclePlate
	info.AvgPartnerRating = relayScore

	return info, nil
}

