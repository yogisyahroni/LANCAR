package repository

import (
	"context"
	"database/sql"
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
	// Haversine distance calculation in SQL
	query := `
		SELECT 
		    cp.id as courier_id,
		    u.full_name as courier_name,
		    COALESCE(cp.avg_rating, 0) as avg_rating,
		    cp.vehicle_type,
		    cp.vehicle_type_car,
		    COALESCE(csp.price_amount, 0) as courier_service_price,
		    (
		        6371 * acos(
		            cos(radians($1)) * cos(radians(cp.latitude)) *
		            cos(radians(cp.longitude) - radians($2)) +
		            sin(radians($1)) * sin(radians(cp.latitude))
		        )
		    ) as distance_km
		FROM courier_profiles cp
		JOIN users u ON cp.user_id = u.id
		LEFT JOIN courier_service_prices csp 
		    ON cp.id = csp.courier_id 
		    AND csp.service_code = $3
		    AND csp.is_active = TRUE
		WHERE 
		    cp.status = 'active'
		    AND cp.is_online = TRUE
		    AND ($4 = ANY(cp.service_categories) OR cp.allows_tambal_ban = TRUE OR cp.allows_towing = TRUE)
		    AND (
		        6371 * acos(
		            cos(radians($1)) * cos(radians(cp.latitude)) *
		            cos(radians(cp.longitude) - radians($2)) +
		            sin(radians($1)) * sin(radians(cp.latitude))
		        )
		    ) <= $5
		ORDER BY distance_km ASC
		LIMIT 10`
	
	rows, err := r.db.QueryContext(ctx, query, lat, lng, serviceSubType, serviceSubType, radiusKM)
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
			&c.DistanceKM,
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
	query := `
		INSERT INTO tambal_ban_reports 
		    (order_id, courier_id, tire_condition_before, tire_photo_before_url,
		     service_duration_minutes, materials_used, notes,
		     tire_condition_after, tire_photo_after_url, completed_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		RETURNING id, created_at`
	return r.db.QueryRowContext(ctx, query,
		report.OrderID, report.CourierID,
		report.TireConditionBefore, report.TirePhotoBeforeURL,
		report.ServiceDurationMins, report.MaterialsUsed, report.Notes,
		report.TireConditionAfter, report.TirePhotoAfterURL, report.CompletedAt,
	).Scan(&report.ID, &report.CreatedAt)
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
	return report, nil
}

func (r *serviceReportRepo) CreateTowingReport(ctx context.Context, report *domain.TowingReport) error {
	query := `
		INSERT INTO towing_reports 
		    (order_id, courier_id, vehicle_condition_before, vehicle_photo_before_url, odometer_reading,
		     loading_photo_url, loading_started_at,
		     transit_started_at, transit_ended_at,
		     unloading_photo_url, unloading_completed_at, odometer_after,
		     completion_photo_url, signature_url, completed_at, notes)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
		RETURNING id, created_at`
	return r.db.QueryRowContext(ctx, query,
		report.OrderID, report.CourierID,
		report.VehicleConditionBefore, report.VehiclePhotoBeforeURL, report.OdometerReading,
		report.LoadingPhotoURL, report.LoadingStartedAt,
		report.TransitStartedAt, report.TransitEndedAt,
		report.UnloadingPhotoURL, report.UnloadingCompletedAt, report.OdometerAfter,
		report.CompletionPhotoURL, report.SignatureURL, report.CompletedAt, report.Notes,
	).Scan(&report.ID, &report.CreatedAt)
}

func (r *serviceReportRepo) GetTowingReportByOrderID(ctx context.Context, orderID string) (*domain.TowingReport, error) {
	query := `
		SELECT id, order_id, courier_id, vehicle_condition_before, vehicle_photo_before_url, odometer_reading,
		       loading_photo_url, loading_started_at,
		       transit_started_at, transit_ended_at,
		       unloading_photo_url, unloading_completed_at, odometer_after,
		       completion_photo_url, signature_url, completed_at, notes, created_at
		FROM towing_reports WHERE order_id = $1`
	
	report := &domain.TowingReport{}
	err := r.db.QueryRowContext(ctx, query, orderID).Scan(
		&report.ID, &report.OrderID, &report.CourierID,
		&report.VehicleConditionBefore, &report.VehiclePhotoBeforeURL, &report.OdometerReading,
		&report.LoadingPhotoURL, &report.LoadingStartedAt,
		&report.TransitStartedAt, &report.TransitEndedAt,
		&report.UnloadingPhotoURL, &report.UnloadingCompletedAt, &report.OdometerAfter,
		&report.CompletionPhotoURL, &report.SignatureURL, &report.CompletedAt, &report.Notes,
		&report.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return report, nil
}
