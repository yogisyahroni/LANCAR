package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"tembus/order-service/internal/domain"
	"time"
)

type settlementRepo struct {
	db *sql.DB
}

func NewSettlementRepository(db *sql.DB) domain.SettlementRepository {
	return &settlementRepo{db: db}
}

func (r *settlementRepo) GetSettlementConfig(ctx context.Context, serviceCode string) (*domain.SettlementConfig, error) {
	query := `
		SELECT id, service_code, service_category, commission_basis, 
		       platform_commission_pct, mdr_pct, tax_pct,
		       courier_keeps_service_fee, courier_keeps_base_fee, courier_keeps_toll,
		       created_at, updated_at
		FROM settlement_configs 
		WHERE service_code = $1`

	config := &domain.SettlementConfig{}
	err := r.db.QueryRowContext(ctx, query, serviceCode).Scan(
		&config.ID, &config.ServiceCode, &config.ServiceCategory,
		&config.CommissionBasis, &config.PlatformCommissionPct,
		&config.MDRPct, &config.TaxPct,
		&config.CourierKeepsServiceFee, &config.CourierKeepsBaseFee, &config.CourierKeepsToll,
		&config.CreatedAt, &config.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("settlement config not found for %s: %w", serviceCode, err)
	}
	return config, nil
}

func (r *settlementRepo) GetAllSettlementConfigs(ctx context.Context) ([]*domain.SettlementConfig, error) {
	query := `
		SELECT id, service_code, service_category, commission_basis, 
		       platform_commission_pct, mdr_pct, tax_pct,
		       courier_keeps_service_fee, courier_keeps_base_fee, courier_keeps_toll,
		       created_at, updated_at
		FROM settlement_configs 
		ORDER BY service_code`

	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var configs []*domain.SettlementConfig
	for rows.Next() {
		config := &domain.SettlementConfig{}
		err := rows.Scan(
			&config.ID, &config.ServiceCode, &config.ServiceCategory,
			&config.CommissionBasis, &config.PlatformCommissionPct,
			&config.MDRPct, &config.TaxPct,
			&config.CourierKeepsServiceFee, &config.CourierKeepsBaseFee, &config.CourierKeepsToll,
			&config.CreatedAt, &config.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		configs = append(configs, config)
	}
	return configs, nil
}

// ============================================================
// Availability Repository
// ============================================================

type availabilityRepo struct {
	db *sql.DB
}

func NewAvailabilityRepository(db *sql.DB) domain.AvailabilityRepository {
	return &availabilityRepo{db: db}
}

func (r *availabilityRepo) GetAvailabilityState(ctx context.Context, courierID string) (*domain.CourierAvailabilityState, error) {
	query := `
		SELECT courier_id, current_state, active_order_id, active_order_type,
		       latitude, longitude, last_location_update, created_at, updated_at
		FROM courier_availability_state 
		WHERE courier_id = $1`

	state := &domain.CourierAvailabilityState{}
	err := r.db.QueryRowContext(ctx, query, courierID).Scan(
		&state.CourierID, &state.CurrentState, &state.ActiveOrderID, &state.ActiveOrderType,
		&state.Latitude, &state.Longitude, &state.LastLocationUpdate,
		&state.CreatedAt, &state.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("availability state not found for courier %s: %w", courierID, err)
	}
	return state, nil
}

func (r *availabilityRepo) UpsertAvailabilityState(ctx context.Context, state *domain.CourierAvailabilityState) error {
	query := `
		INSERT INTO courier_availability_state 
		    (courier_id, current_state, active_order_id, active_order_type, 
		     latitude, longitude, last_location_update, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		ON CONFLICT (courier_id) DO UPDATE SET
		    current_state = EXCLUDED.current_state,
		    active_order_id = EXCLUDED.active_order_id,
		    active_order_type = EXCLUDED.active_order_type,
		    latitude = EXCLUDED.latitude,
		    longitude = EXCLUDED.longitude,
		    last_location_update = EXCLUDED.last_location_update,
		    updated_at = EXCLUDED.updated_at`

	now := time.Now()
	_, err := r.db.ExecContext(ctx, query,
		state.CourierID, state.CurrentState, state.ActiveOrderID, state.ActiveOrderType,
		state.Latitude, state.Longitude, now, now,
	)
	return err
}

func (r *availabilityRepo) FindCouriersByCapability(
	ctx context.Context,
	serviceSubType string,
	radiusKM, lat, lng float64,
) ([]*domain.NearbyCourier, error) {
	// Food delivery: wajib kendaraan 'sepeda' + dalam radius pribadi driver (radius_max_km)
	// (inline check — hindari import cycle service→repository)
	isFood := serviceSubType == "food_delivery"

	// Haversine distance calculation in SQL
	query := `
		SELECT 
		    cp.id as courier_id,
		    u.full_name as courier_name,
		    COALESCE(cp.avg_rating, 0) as avg_rating,
		    cp.vehicle_type,
		    cp.vehicle_type_car,
		    COALESCE(csp.price_amount, 0) as courier_service_price,
		    COALESCE(cp.radius_max_km, 1) as radius_max_km,
		    (
		        6371 * acos(
		            cos(radians($1)) * cos(radians(cp.current_lat)) *
		            cos(radians(cp.current_lng) - radians($2)) +
		            sin(radians($1)) * sin(radians(cp.current_lat))
		        )
		    ) as distance_km
		FROM courier_profiles cp
		JOIN users u ON cp.user_id = u.id
		LEFT JOIN courier_service_prices csp 
		    ON cp.id = csp.courier_id 
		    AND csp.service_code = $3
		    AND csp.is_active = TRUE
		WHERE 
		    cp.verification_status = 'approved'
		    AND cp.is_online = TRUE
		    AND ($4 = ANY(cp.service_categories) OR cp.allows_tambal_ban = TRUE OR cp.allows_towing = TRUE)
		    AND (
		        6371 * acos(
		            cos(radians($1)) * cos(radians(cp.current_lat)) *
		            cos(radians(cp.current_lng) - radians($2)) +
		            sin(radians($1)) * sin(radians(cp.current_lat))
		        )
		    ) <= $5`

	args := []any{lat, lng, serviceSubType, serviceSubType, radiusKM}

	// Food delivery: hanya kurir bersepeda, dan hanya dalam radius yang dia set sendiri
	if isFood {
		query += `
		    AND cp.vehicle_type = 'sepeda'
		    AND cp.radius_max_km IS NOT NULL
		    AND cp.radius_max_km >= (
		        6371 * acos(
		            cos(radians($1)) * cos(radians(cp.current_lat)) *
		            cos(radians(cp.current_lng) - radians($2)) +
		            sin(radians($1)) * sin(radians(cp.current_lat))
		        )
		    )`
	}

	query += `
		ORDER BY distance_km ASC
		LIMIT 10`

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var couriers []*domain.NearbyCourier
	for rows.Next() {
		c := &domain.NearbyCourier{}
		err := rows.Scan(
			&c.CourierID, &c.CourierName, &c.Rating,
			&c.VehicleType, &c.VehicleTypeCar, &c.CourierServicePrice,
			&c.RadiusMaxKM, &c.DistanceKM,
		)
		if err != nil {
			return nil, err
		}
		c.ServiceSubType = serviceSubType
		c.ETAMinutes = int(math.Ceil(c.DistanceKM * 2.5)) // rough estimate
		couriers = append(couriers, c)
	}
	return couriers, nil
}

// GetCourierByID — detail satu teknisi (tanpa filter radius; jarak dihitung
// dari lat/lng user bila valid, fallback 0). Fix 404: sebelumnya detail
// memakai FindCouriersByCapability dengan lat/lng 0 → haversine dari (0,0)
// ≈ 11.000 km > radius 50 km → courier selalu terfilter.
func (r *availabilityRepo) GetCourierByID(ctx context.Context, courierID, serviceSubType string, lat, lng float64) (*domain.NearbyCourier, error) {
	if lat == 0 && lng == 0 {
		lat, lng = -6.2, 106.816666 // fallback Jakarta (home default)
	}
	query := `
		SELECT
		    cp.id as courier_id,
		    u.full_name as courier_name,
		    COALESCE(cp.avg_rating, 0) as avg_rating,
		    cp.vehicle_type,
		    cp.vehicle_type_car,
		    COALESCE(csp.price_amount, 0) as courier_service_price,
		    COALESCE(cp.radius_max_km, 1) as radius_max_km,
		    (
		        6371 * acos(
		            cos(radians($2)) * cos(radians(cp.current_lat)) *
		            cos(radians(cp.current_lng) - radians($3)) +
		            sin(radians($2)) * sin(radians(cp.current_lat))
		        )
		    ) as distance_km
		FROM courier_profiles cp
		JOIN users u ON cp.user_id = u.id
		LEFT JOIN courier_service_prices csp
		    ON cp.id = csp.courier_id
		    AND csp.service_code = $4
		    AND csp.is_active = TRUE
		WHERE cp.id = $1
		  AND cp.verification_status = 'approved'
		  AND ($4 = ANY(cp.service_categories) OR cp.allows_tambal_ban = TRUE OR cp.allows_towing = TRUE)`

	c := &domain.NearbyCourier{}
	err := r.db.QueryRowContext(ctx, query, courierID, lat, lng, serviceSubType).Scan(
		&c.CourierID, &c.CourierName, &c.Rating,
		&c.VehicleType, &c.VehicleTypeCar, &c.CourierServicePrice,
		&c.RadiusMaxKM, &c.DistanceKM,
	)
	if err != nil {
		return nil, err
	}
	c.ServiceSubType = serviceSubType
	c.ETAMinutes = int(math.Ceil(c.DistanceKM * 2.5)) // rough estimate
	return c, nil
}

func (r *availabilityRepo) GetDeliveryServiceByCode(ctx context.Context, code string) (*domain.DeliveryServiceProduct, error) {
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
			max_weight_kg,
			platform_fee_idr,
			platform_fee_pct,
			COALESCE(search_radii_km::text, '[3, 5, 10]') AS search_radii_km
		FROM delivery_service_products
		WHERE code = $1
		LIMIT 1
	`

	service := &domain.DeliveryServiceProduct{}
	var searchRadiiJSON string
	err := r.db.QueryRowContext(ctx, query, code).Scan(
		&service.Code,
		&service.Name,
		&service.BaseFareIDR,
		&service.PerKmIDR,
		&service.IncludedDistanceKM,
		&service.UsesSizeTier,
		&service.MaxDistanceKM,
		&service.MaxWeightKG,
		&service.PlatformFeeIDR,
		&service.PlatformFeePct,
		&searchRadiiJSON,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("active delivery service not found for code %s", code)
		}
		return nil, err
	}

	if err := json.Unmarshal([]byte(searchRadiiJSON), &service.SearchRadiiKM); err != nil || len(service.SearchRadiiKM) == 0 {
		service.SearchRadiiKM = []float64{3, 5, 10}
	}
	return service, nil
}

func (r *availabilityRepo) GetCourierServicePrice(ctx context.Context, courierID, serviceCode string) (int64, error) {
	query := `SELECT price_amount FROM courier_service_prices WHERE courier_id = $1 AND service_code = $2 AND is_active = TRUE`
	var price int64
	err := r.db.QueryRowContext(ctx, query, courierID, serviceCode).Scan(&price)
	if err != nil {
		return 0, err
	}
	return price, nil
}

func (r *availabilityRepo) EstimateDistanceKM(ctx context.Context, lat1, lng1, lat2, lng2 float64) (float64, error) {
	// Haversine formula
	const earthRadiusKM = 6371.0
	dLat := (lat2 - lat1) * math.Pi / 180.0
	dLng := (lng2 - lng1) * math.Pi / 180.0
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(lat1*math.Pi/180.0)*math.Cos(lat2*math.Pi/180.0)*
			math.Sin(dLng/2)*math.Sin(dLng/2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
	return earthRadiusKM * c, nil
}

func (r *availabilityRepo) GetCourierVehicleType(ctx context.Context, courierID string) (string, *string, error) {
	query := `
		SELECT cp.vehicle_type, cp.vehicle_type_car
		FROM courier_profiles cp
		WHERE cp.id = $1`

	var vehicleType string
	var vehicleTypeCar *string
	err := r.db.QueryRowContext(ctx, query, courierID).Scan(&vehicleType, &vehicleTypeCar)
	if err != nil {
		return "", nil, fmt.Errorf("courier vehicle not found for %s: %w", courierID, err)
	}
	return vehicleType, vehicleTypeCar, nil
}

func (r *availabilityRepo) GetActiveOrderRemainingMinutes(ctx context.Context, courierID string) (int, error) {
	// Find active order for this courier and estimate remaining time
	// Uses updated_at as proxy for when the order was last touched,
	// combined with a default SLA estimate
	query := `
		SELECT o.id, o.created_at, o.status
		FROM orders o
		WHERE o.courier_id = $1
		  AND o.status IN ('assigned', 'picked_up', 'in_transit', 'navigating', 'arriving', 'arrived')
		ORDER BY o.updated_at DESC
		LIMIT 1`

	var orderID string
	var createdAt time.Time
	var status string
	err := r.db.QueryRowContext(ctx, query, courierID).Scan(&orderID, &createdAt, &status)
	if err != nil {
		// No active order = assume plenty of time
		return 999, nil
	}

	// Estimate remaining time based on order age and status
	elapsed := time.Since(createdAt)
	elapsedMinutes := int(elapsed.Minutes())

	// Default SLA: 60 minutes total for on-demand, 90 for towing
	// If order has been active for less than 45 min, assume at least 15 min remaining
	slaMinutes := 60
	if status == "in_transit" {
		slaMinutes = 45 // transit is usually shorter
	}

	remaining := slaMinutes - elapsedMinutes
	if remaining < 0 {
		remaining = 0
	}

	return remaining, nil
}

// UpdateCourierRadius — FOOD-BIKE-029: set radius_max_km driver
// (CHECK constraint: 1,2,4,6,10,12,14,16,18,20). Dipanggil saat driver
// mengubah radius jangkauan food delivery dari app.
// courierID dari JWT = users.id → resolve ke courier_profiles.id dulu.
func (r *availabilityRepo) UpdateCourierRadius(ctx context.Context, courierID string, radiusKM int) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE courier_profiles SET radius_max_km = $1, updated_at = NOW()
		 WHERE user_id = $2`,
		radiusKM, courierID,
	)
	return err
}

// ============================================================
// Service Report Repository
// ============================================================

type serviceReportRepo struct {
	db *sql.DB
}

func NewServiceReportRepository(db *sql.DB) domain.ServiceReportRepository {
	return &serviceReportRepo{db: db}
}

func (r *serviceReportRepo) CreateTambalBanReport(ctx context.Context, report *domain.TambalBanReport) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tambal ban report tx: %w", err)
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock(hashtext($1))`, "tambal_ban_report:"+report.OrderID); err != nil {
		return fmt.Errorf("lock tambal ban report: %w", err)
	}

	existing := tx.QueryRowContext(ctx, `
		SELECT id, created_at
		FROM tambal_ban_reports
		WHERE order_id = $1
		ORDER BY created_at ASC
		LIMIT 1`, report.OrderID)
	if err := existing.Scan(&report.ID, &report.CreatedAt); err == nil {
		return tx.Commit()
	} else if !errors.Is(err, sql.ErrNoRows) {
		return fmt.Errorf("check tambal ban report idempotency: %w", err)
	}

	query := `
		INSERT INTO tambal_ban_reports 
		    (order_id, courier_id, tire_condition_before, tire_photo_before_url,
		     service_duration_minutes, materials_used, notes,
		     tire_condition_after, tire_photo_after_url, completed_at)
		VALUES ($1, (SELECT id FROM courier_profiles WHERE user_id = $2), $3, $4, $5, $6, $7, $8, $9, $10)
		RETURNING id, created_at`
	if err := tx.QueryRowContext(ctx, query,
		report.OrderID, report.CourierID,
		report.TireConditionBefore, report.TirePhotoBeforeURL,
		report.ServiceDurationMins, report.MaterialsUsed, report.Notes,
		report.TireConditionAfter, report.TirePhotoAfterURL, report.CompletedAt,
	).Scan(&report.ID, &report.CreatedAt); err != nil {
		return err
	}
	return tx.Commit()
}

func (r *serviceReportRepo) GetTambalBanReportByOrderID(ctx context.Context, orderID string) (*domain.TambalBanReport, error) {
	query := `
		SELECT id, order_id, courier_id, tire_condition_before, tire_photo_before_url,
		       service_duration_minutes, materials_used, notes,
		       tire_condition_after, tire_photo_after_url, completed_at, created_at
		FROM tambal_ban_reports WHERE order_id = $1`

	report := &domain.TambalBanReport{}
	err := r.db.QueryRowContext(ctx, query, orderID).Scan(
		&report.ID, &report.OrderID, &report.CourierID,
		&report.TireConditionBefore, &report.TirePhotoBeforeURL,
		&report.ServiceDurationMins, &report.MaterialsUsed, &report.Notes,
		&report.TireConditionAfter, &report.TirePhotoAfterURL,
		&report.CompletedAt, &report.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	if report.MaterialsUsed != nil {
		var items []string
		if json.Unmarshal([]byte(*report.MaterialsUsed), &items) == nil {
			report.MaterialsUsedItems = items
		}
	}
	return report, nil
}

func (r *serviceReportRepo) CreateTowingReport(ctx context.Context, report *domain.TowingReport) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin towing report tx: %w", err)
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock(hashtext($1))`, "towing_report:"+report.OrderID); err != nil {
		return fmt.Errorf("lock towing report: %w", err)
	}

	existing := tx.QueryRowContext(ctx, `
		SELECT id, created_at
		FROM towing_reports
		WHERE order_id = $1
		ORDER BY created_at ASC
		LIMIT 1`, report.OrderID)
	if err := existing.Scan(&report.ID, &report.CreatedAt); err == nil {
		return tx.Commit()
	} else if !errors.Is(err, sql.ErrNoRows) {
		return fmt.Errorf("check towing report idempotency: %w", err)
	}

	var damageReportJSON []byte
	if report.DamageReport != nil {
		var err error
		damageReportJSON, err = json.Marshal(report.DamageReport)
		if err != nil {
			return fmt.Errorf("encode towing damage report: %w", err)
		}
	}

	query := `
		INSERT INTO towing_reports 
		    (order_id, courier_id, vehicle_condition_before, vehicle_photo_before_url, odometer_reading,
		     loading_photo_url, loading_started_at,
		     transit_started_at, transit_ended_at,
		     unloading_photo_url, unloading_completed_at, odometer_after,
		     completion_photo_url, signature_url, damage_report, completed_at, notes)
		VALUES ($1, (SELECT id FROM courier_profiles WHERE user_id = $2), $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
		RETURNING id, created_at`
	if err := tx.QueryRowContext(ctx, query,
		report.OrderID, report.CourierID,
		report.VehicleConditionBefore, report.VehiclePhotoBeforeURL, report.OdometerReading,
		report.LoadingPhotoURL, report.LoadingStartedAt,
		report.TransitStartedAt, report.TransitEndedAt,
		report.UnloadingPhotoURL, report.UnloadingCompletedAt, report.OdometerAfter,
		report.CompletionPhotoURL, report.SignatureURL, damageReportJSON, report.CompletedAt, report.Notes,
	).Scan(&report.ID, &report.CreatedAt); err != nil {
		return err
	}
	return tx.Commit()
}

func (r *serviceReportRepo) GetTowingReportByOrderID(ctx context.Context, orderID string) (*domain.TowingReport, error) {
	query := `
		SELECT id, order_id, courier_id, vehicle_condition_before, vehicle_photo_before_url, odometer_reading,
		       loading_photo_url, loading_started_at,
		       transit_started_at, transit_ended_at,
		       unloading_photo_url, unloading_completed_at, odometer_after,
		       completion_photo_url, signature_url, damage_report, completed_at, notes, created_at
		FROM towing_reports WHERE order_id = $1`

	report := &domain.TowingReport{}
	var damageReportJSON []byte
	err := r.db.QueryRowContext(ctx, query, orderID).Scan(
		&report.ID, &report.OrderID, &report.CourierID,
		&report.VehicleConditionBefore, &report.VehiclePhotoBeforeURL, &report.OdometerReading,
		&report.LoadingPhotoURL, &report.LoadingStartedAt,
		&report.TransitStartedAt, &report.TransitEndedAt,
		&report.UnloadingPhotoURL, &report.UnloadingCompletedAt, &report.OdometerAfter,
		&report.CompletionPhotoURL, &report.SignatureURL, &damageReportJSON, &report.CompletedAt, &report.Notes,
		&report.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	if len(damageReportJSON) > 0 {
		report.DamageReport = &domain.TowingDamageReport{}
		if err := json.Unmarshal(damageReportJSON, report.DamageReport); err != nil {
			return nil, fmt.Errorf("decode towing damage report: %w", err)
		}
	}
	return report, nil
}
