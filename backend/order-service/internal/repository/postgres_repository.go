package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"tembus/order-service/internal/domain"
	"time"
)

type postgresRepo struct {
	db         *sql.DB // writer
	readDB     *sql.DB // reader
	configRepo domain.ConfigRepository
}

// ListTrackingPollTargets returns active aggregator shipments with a provider
// AWB. The integration gateway uses this as its durable polling queue source.
func (r *postgresRepo) ListTrackingPollTargets(ctx context.Context) ([]domain.TrackingPollTarget, error) {
	const query = `
		SELECT LOWER(TRIM(logistics_provider)), TRIM(awb_number)
		FROM orders
		WHERE NULLIF(TRIM(logistics_provider), '') IS NOT NULL
		  AND NULLIF(TRIM(awb_number), '') IS NOT NULL
		  AND status NOT IN ('delivered', 'completed', 'cancelled', 'failed', 'rejected')
		ORDER BY updated_at ASC
		LIMIT 500`

	rows, err := r.readDB.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("list tracking poll targets: %w", err)
	}
	defer rows.Close()

	targets := make([]domain.TrackingPollTarget, 0)
	for rows.Next() {
		var target domain.TrackingPollTarget
		if err := rows.Scan(&target.Provider, &target.AWB); err != nil {
			return nil, fmt.Errorf("scan tracking poll target: %w", err)
		}
		targets = append(targets, target)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate tracking poll targets: %w", err)
	}
	return targets, nil
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
			max_weight_kg,
			platform_fee_idr,
			platform_fee_pct,
			COALESCE(search_radii_km::text, '[3, 5, 10]') AS search_radii_km
		FROM delivery_service_products
		WHERE code = $1 AND is_enabled = TRUE
		LIMIT 1
	`

	service := &domain.DeliveryServiceProduct{}
	var searchRadiiJSON string
	err := r.readDB.QueryRowContext(ctx, query, code).Scan(
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

// Order Repository Implementation
func (r *postgresRepo) Create(ctx context.Context, o *domain.Order) error {
	return r.insertOrder(ctx, r.db, o)
}

// execer — interface minimal yang dipenuhi *sql.DB dan *sql.Tx,
// supaya insertOrder bisa dipakai baik langsung maupun dalam transaksi.
type execer interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
}

func sqlNullableString(value string) any {
	if value == "" {
		return nil
	}
	return value
}

func (r *postgresRepo) insertOrder(ctx context.Context, q execer, o *domain.Order) error {
	o.ApplyCanonicalOrderContract()
	serviceMetadata, _ := json.Marshal(o.ServiceMetadata)
	query := `INSERT INTO orders (
				id, order_number, customer_id, model, status, 
				pickup_location, pickup_address, pickup_city, pickup_zip_code,
				dropoff_location, dropoff_address, dropoff_city, dropoff_zip_code,
				length, width, height, weight, item_description, item_image_url,
				distance_km, included_distance_km, distance_fee_idr, volumetric_weight_kg,
				base_price_idr, volumetric_surcharge_idr, 
				dynamic_price_idr, surge_fee_idr, discount_idr, promo_code, promo_sponsor,
				surge_multiplier, weather_multiplier, traffic_multiplier, pricing_snapshot,
				total_price_idr, ppn_idr, mdr_idr, handover_token,
				dispatch_expiry, batch_id, sequence_no, receiver_name, receiver_phone, routing_code,
					tax_rule_code, ppn_rate_effective_pct, ppn_rate_statutory_pct, dpp_idr,
					tax_invoice_required, tax_invoice_status, platform_fee_idr, platform_fee_pct, promo_subsidy_idr,
						service_sub_type, merchant_id, prep_time_minutes,
					contactless,
					order_notes,
					-- FB-123: NULL = pesan langsung; diisi = terjadwal
					scheduled_at,
					service_category, contract_version, quote_id, state_version, correlation_id, service_metadata,
					created_at, updated_at
					) VALUES (
					$1, $2, $3, $4, $5, 
					ST_SetSRID(ST_MakePoint($6, $7), 4326), $8, $9, $10,
					ST_SetSRID(ST_MakePoint($11, $12), 4326), $13, $14, $15,
					$16, $17, $18, $19, $20, $21,
					$22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35,
					$36, $37, $38, $39, $40, $41, $42, $43, $44,
					$45, $46, $47, $48, $49, $50, $51, $52, $53, $54, $55,
					$56, $57, $58, $59, $60,
					$61, $62, $63, $64, $65, $66, $67, $68, $69
					)`

	mdrFixed := r.configRepo.GetIntConfig(ctx, "payment_mdr_fixed", 2500)
	mdr := int64(mdrFixed)
	if o.PromoSponsor == "" {
		o.PromoSponsor = "platform"
	}
	if o.SurgeMultiplier == 0 {
		o.SurgeMultiplier = 1.0
	}
	if o.WeatherMultiplier == 0 {
		o.WeatherMultiplier = 1.0
	}
	if o.TrafficMultiplier == 0 {
		o.TrafficMultiplier = 1.0
	}

	_, err := q.ExecContext(ctx, query,
		o.ID, o.OrderNumber, o.CustomerID, o.Model, o.Status,
		o.PickupLng, o.PickupLat, o.PickupAddress, o.PickupCity, o.PickupZipCode,
		o.DropoffLng, o.DropoffLat, o.DropoffAddress, o.DropoffCity, o.DropoffZipCode,
		o.Length, o.Width, o.Height, o.Weight, o.ItemDescription, o.ItemImageURL,
		o.DistanceKM, o.IncludedDistanceKM, o.DistanceFeeIDR, o.VolumetricWeightKG,
		o.BasePriceIDR, o.VolumetricSurchargeIDR,
		o.DynamicPriceIDR, o.SurgeFeeIDR, o.DiscountIDR, o.PromoCode, o.PromoSponsor,
		o.SurgeMultiplier, o.WeatherMultiplier, o.TrafficMultiplier, o.PricingSnapshot,
		o.TotalPriceIDR, o.PPNIDR, mdr, o.HandoverToken,
		o.DispatchExpiry, o.BatchID, o.SequenceNo, o.ReceiverName, o.ReceiverPhone, o.RoutingCode,
		o.TaxRuleCode, o.PPNRateEffectivePct, o.PPNRateStatutoryPct, o.DPPIDR,
		o.TaxInvoiceRequired, o.TaxInvoiceStatus, o.PlatformFeeIDR, o.PlatformFeePct, o.PromoSubsidyIDR,
		o.ServiceSubType, o.MerchantID, o.PrepTimeMinutes,
		o.Contactless,
		o.OrderNotes,
		o.ScheduledAt, // FB-123
		o.ServiceCategory, o.ContractVersion, sqlNullableString(o.QuoteID), o.StateVersion, sqlNullableString(o.CorrelationID), serviceMetadata,
		o.CreatedAt, o.UpdatedAt,
	)
	return err
}

func (r *postgresRepo) GetByID(ctx context.Context, id string) (*domain.Order, error) {
	query := `SELECT 
				o.id, o.order_number, o.customer_id, o.model, o.status, 
				ST_Y(o.pickup_location::geometry), ST_X(o.pickup_location::geometry), o.pickup_address, COALESCE(o.pickup_city, ''), COALESCE(o.pickup_zip_code, ''),
				ST_Y(o.dropoff_location::geometry), ST_X(o.dropoff_location::geometry), o.dropoff_address, COALESCE(o.dropoff_city, ''), COALESCE(o.dropoff_zip_code, ''),
				COALESCE(o.length, 0), COALESCE(o.width, 0), COALESCE(o.height, 0), COALESCE(o.weight, 0), COALESCE(o.item_description, ''), COALESCE(o.item_image_url, ''),
				o.distance_km, COALESCE(o.included_distance_km, 0), COALESCE(o.distance_fee_idr, 0), COALESCE(o.volumetric_weight_kg, 0),
				o.base_price_idr, o.volumetric_surcharge_idr, 
				o.dynamic_price_idr, COALESCE(o.surge_fee_idr, 0), COALESCE(o.discount_idr, 0), COALESCE(o.promo_code, ''), COALESCE(o.promo_sponsor, 'platform'),
				COALESCE(o.surge_multiplier, 1), COALESCE(o.weather_multiplier, 1), COALESCE(o.traffic_multiplier, 1), COALESCE(o.pricing_snapshot::text, ''),
				o.total_price_idr, COALESCE(o.handover_token, ''), o.dispatch_expiry, o.batch_id, o.sequence_no,
				COALESCE((SELECT ol.courier_id::text FROM order_legs ol WHERE ol.order_id = o.id AND ol.leg_number = 1 LIMIT 1), ''),
				COALESCE(o.awb_number, ''), COALESCE(o.tracking_url, ''),
				COALESCE(o.receiver_name, ''), COALESCE(o.receiver_phone, ''), COALESCE(o.routing_code, ''),
				COALESCE(o.tax_rule_code, ''), COALESCE(o.ppn_rate_effective_pct, 0), COALESCE(o.ppn_rate_statutory_pct, 0), COALESCE(o.dpp_idr, 0), COALESCE(o.ppn_idr, 0),
				COALESCE(o.tax_invoice_required, false), COALESCE(o.tax_invoice_status, ''), COALESCE(o.platform_fee_idr, 0), COALESCE(o.platform_fee_pct, 0), COALESCE(o.promo_subsidy_idr, 0),
				COALESCE(o.service_sub_type, ''), COALESCE(o.service_code, ''), COALESCE(o.merchant_id::text, ''), o.merchant_accepted_at, o.prep_time_minutes, o.food_ready_at,
				COALESCE(o.contactless, false),
				COALESCE(o.order_notes, ''),
				o.scheduled_at,
				COALESCE(o.service_category, ''), COALESCE(o.contract_version, '2026-09-01'), COALESCE(o.quote_id, ''),
				COALESCE(o.state_version, 1), COALESCE(o.correlation_id::text, ''), COALESCE(o.service_metadata, '{}'::jsonb),
				COALESCE(m.nama_toko, ''),
				o.created_at, o.updated_at
				FROM orders o
				LEFT JOIN merchants m ON m.id = o.merchant_id
				WHERE o.id = $1`

	o := &domain.Order{}
	var courierID, merchantID string
	var serviceMetadata []byte
	err := r.readDB.QueryRowContext(ctx, query, id).Scan(
		&o.ID, &o.OrderNumber, &o.CustomerID, &o.Model, &o.Status,
		&o.PickupLat, &o.PickupLng, &o.PickupAddress, &o.PickupCity, &o.PickupZipCode,
		&o.DropoffLat, &o.DropoffLng, &o.DropoffAddress, &o.DropoffCity, &o.DropoffZipCode,
		&o.Length, &o.Width, &o.Height, &o.Weight, &o.ItemDescription, &o.ItemImageURL,
		&o.DistanceKM, &o.IncludedDistanceKM, &o.DistanceFeeIDR, &o.VolumetricWeightKG,
		&o.BasePriceIDR, &o.VolumetricSurchargeIDR,
		&o.DynamicPriceIDR, &o.SurgeFeeIDR, &o.DiscountIDR, &o.PromoCode, &o.PromoSponsor,
		&o.SurgeMultiplier, &o.WeatherMultiplier, &o.TrafficMultiplier, &o.PricingSnapshot,
		&o.TotalPriceIDR, &o.HandoverToken, &o.DispatchExpiry, &o.BatchID, &o.SequenceNo, &courierID, &o.AWB, &o.TrackingURL,
		&o.ReceiverName, &o.ReceiverPhone, &o.RoutingCode,
		&o.TaxRuleCode, &o.PPNRateEffectivePct, &o.PPNRateStatutoryPct, &o.DPPIDR, &o.PPNIDR,
		&o.TaxInvoiceRequired, &o.TaxInvoiceStatus, &o.PlatformFeeIDR, &o.PlatformFeePct, &o.PromoSubsidyIDR,
		&o.ServiceSubType, &o.ServiceCode, &merchantID, &o.MerchantAcceptedAt, &o.PrepTimeMinutes, &o.FoodReadyAt,
		&o.Contactless,
		&o.OrderNotes,
		&o.ScheduledAt, // FB-123: NULL = pesan langsung
		&o.ServiceCategory, &o.ContractVersion, &o.QuoteID, &o.StateVersion, &o.CorrelationID, &serviceMetadata,
		&o.MerchantName,
		&o.CreatedAt, &o.UpdatedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	if courierID != "" {
		o.CourierID = &courierID
	}
	if merchantID != "" {
		o.MerchantID = &merchantID
	}
	// FB-123: IsScheduled = turunan dari scheduled_at (computed).
	o.IsScheduled = o.ScheduledAt != nil
	_ = json.Unmarshal(serviceMetadata, &o.ServiceMetadata)
	o.ApplyCanonicalOrderContract()
	return o, nil
}

func (r *postgresRepo) GetByOrderNumber(ctx context.Context, orderNumber string) (*domain.Order, error) {
	query := `SELECT 
				id, order_number, customer_id, model, status, 
				ST_Y(pickup_location::geometry), ST_X(pickup_location::geometry), pickup_address, COALESCE(pickup_city, ''), COALESCE(pickup_zip_code, ''),
				ST_Y(dropoff_location::geometry), ST_X(dropoff_location::geometry), dropoff_address, COALESCE(dropoff_city, ''), COALESCE(dropoff_zip_code, ''),
				COALESCE(length, 0), COALESCE(width, 0), COALESCE(height, 0), COALESCE(weight, 0), COALESCE(item_description, ''), COALESCE(item_image_url, ''),
				distance_km, base_price_idr, volumetric_surcharge_idr, 
				dynamic_price_idr, total_price_idr, COALESCE(handover_token, ''), dispatch_expiry, COALESCE(batch_id::text, ''), COALESCE(sequence_no, 0),
				COALESCE((SELECT ol.courier_id::text FROM order_legs ol WHERE ol.order_id = orders.id AND ol.leg_number = 1 LIMIT 1), ''),
				COALESCE(awb_number, ''), COALESCE(tracking_url, ''),
				COALESCE(receiver_name, ''), COALESCE(receiver_phone, ''), COALESCE(routing_code, ''),
				COALESCE(tax_rule_code, ''), COALESCE(ppn_rate_effective_pct, 0), COALESCE(ppn_rate_statutory_pct, 0), COALESCE(dpp_idr, 0), COALESCE(ppn_idr, 0),
				COALESCE(tax_invoice_required, false), COALESCE(tax_invoice_status, ''), COALESCE(platform_fee_idr, 0), COALESCE(platform_fee_pct, 0), COALESCE(promo_subsidy_idr, 0),
				created_at, updated_at
			  FROM orders WHERE order_number = $1`

	o := &domain.Order{}
	var courierID string
	err := r.readDB.QueryRowContext(ctx, query, orderNumber).Scan(
		&o.ID, &o.OrderNumber, &o.CustomerID, &o.Model, &o.Status,
		&o.PickupLat, &o.PickupLng, &o.PickupAddress, &o.PickupCity, &o.PickupZipCode,
		&o.DropoffLat, &o.DropoffLng, &o.DropoffAddress, &o.DropoffCity, &o.DropoffZipCode,
		&o.Length, &o.Width, &o.Height, &o.Weight, &o.ItemDescription, &o.ItemImageURL,
		&o.DistanceKM, &o.BasePriceIDR, &o.VolumetricSurchargeIDR,
		&o.DynamicPriceIDR, &o.TotalPriceIDR, &o.HandoverToken, &o.DispatchExpiry, &o.BatchID, &o.SequenceNo, &courierID, &o.AWB, &o.TrackingURL,
		&o.ReceiverName, &o.ReceiverPhone, &o.RoutingCode,
		&o.TaxRuleCode, &o.PPNRateEffectivePct, &o.PPNRateStatutoryPct, &o.DPPIDR, &o.PPNIDR,
		&o.TaxInvoiceRequired, &o.TaxInvoiceStatus, &o.PlatformFeeIDR, &o.PlatformFeePct, &o.PromoSubsidyIDR,
		&o.CreatedAt, &o.UpdatedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	if courierID != "" {
		o.CourierID = &courierID
	}
	o.ApplyCanonicalOrderContract()
	return o, nil
}

func (r *postgresRepo) GetByAWB(ctx context.Context, awb string) (*domain.Order, error) {
	query := `SELECT 
				id, order_number, customer_id, model, status, 
				ST_Y(pickup_location::geometry), ST_X(pickup_location::geometry), pickup_address, 
				ST_Y(dropoff_location::geometry), ST_X(dropoff_location::geometry), dropoff_address, 
				COALESCE(length, 0), COALESCE(width, 0), COALESCE(height, 0), COALESCE(weight, 0), COALESCE(item_description, ''), COALESCE(item_image_url, ''),
				distance_km, base_price_idr, volumetric_surcharge_idr, 
				dynamic_price_idr, total_price_idr, COALESCE(handover_token, ''), dispatch_expiry, COALESCE(batch_id::text, ''), COALESCE(sequence_no, 0),
				COALESCE((SELECT ol.courier_id::text FROM order_legs ol WHERE ol.order_id = orders.id AND ol.leg_number = 1 LIMIT 1), ''),
				COALESCE(awb_number, ''), COALESCE(tracking_url, ''), created_at, updated_at
				FROM orders WHERE awb_number = $1`

	o := &domain.Order{}
	var courierID string
	err := r.readDB.QueryRowContext(ctx, query, awb).Scan(
		&o.ID, &o.OrderNumber, &o.CustomerID, &o.Model, &o.Status,
		&o.PickupLat, &o.PickupLng, &o.PickupAddress,
		&o.DropoffLat, &o.DropoffLng, &o.DropoffAddress,
		&o.Length, &o.Width, &o.Height, &o.Weight, &o.ItemDescription, &o.ItemImageURL,
		&o.DistanceKM, &o.BasePriceIDR, &o.VolumetricSurchargeIDR,
		&o.DynamicPriceIDR, &o.TotalPriceIDR, &o.HandoverToken, &o.DispatchExpiry, &o.BatchID, &o.SequenceNo, &courierID, &o.AWB, &o.TrackingURL, &o.CreatedAt, &o.UpdatedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	if courierID != "" {
		o.CourierID = &courierID
	}
	o.ApplyCanonicalOrderContract()
	return o, nil
}

func (r *postgresRepo) GetByBatchID(ctx context.Context, batchID string) ([]*domain.Order, error) {
	query := `
		SELECT
			id, order_number, customer_id, model, status,
			ST_Y(pickup_location::geometry), ST_X(pickup_location::geometry), pickup_address,
			ST_Y(dropoff_location::geometry), ST_X(dropoff_location::geometry), dropoff_address,
			COALESCE(length, 0), COALESCE(width, 0), COALESCE(height, 0), COALESCE(weight, 0), COALESCE(item_description, ''), COALESCE(item_image_url, ''),
			distance_km, base_price_idr, volumetric_surcharge_idr,
			dynamic_price_idr, total_price_idr, handover_token, dispatch_expiry, batch_id, sequence_no,
			COALESCE((SELECT ol.courier_id::text FROM order_legs ol WHERE ol.order_id = orders.id AND ol.leg_number = 1 LIMIT 1), ''),
			created_at, updated_at
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
		var courierID string
		err := rows.Scan(
			&o.ID, &o.OrderNumber, &o.CustomerID, &o.Model, &o.Status,
			&o.PickupLat, &o.PickupLng, &o.PickupAddress,
			&o.DropoffLat, &o.DropoffLng, &o.DropoffAddress,
			&o.Length, &o.Width, &o.Height, &o.Weight, &o.ItemDescription, &o.ItemImageURL,
			&o.DistanceKM, &o.BasePriceIDR, &o.VolumetricSurchargeIDR,
			&o.DynamicPriceIDR, &o.TotalPriceIDR, &o.HandoverToken, &o.DispatchExpiry, &o.BatchID, &o.SequenceNo, &courierID, &o.CreatedAt, &o.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		if courierID != "" {
			o.CourierID = &courierID
		}
		o.ApplyCanonicalOrderContract()
		orders = append(orders, o)
	}
	return orders, nil
}

func (r *postgresRepo) ListByUserID(ctx context.Context, userID string, filter map[string]interface{}) ([]*domain.Order, error) {
	query := `SELECT 
				id, order_number, customer_id, model, status, 
				ST_Y(pickup_location::geometry), ST_X(pickup_location::geometry), pickup_address, 
				ST_Y(dropoff_location::geometry), ST_X(dropoff_location::geometry), dropoff_address, 
				COALESCE(length, 0), COALESCE(width, 0), COALESCE(height, 0), COALESCE(weight, 0), COALESCE(item_description, ''), COALESCE(item_image_url, ''),
				distance_km, base_price_idr, volumetric_surcharge_idr, 
				dynamic_price_idr, total_price_idr, COALESCE(handover_token, ''), dispatch_expiry, COALESCE(batch_id::text, ''), COALESCE(sequence_no, 0),
				COALESCE((SELECT ol.courier_id::text FROM order_legs ol WHERE ol.order_id = orders.id AND ol.leg_number = 1 LIMIT 1), ''),
				created_at, updated_at
				FROM orders WHERE customer_id = $1 ORDER BY created_at DESC`

	rows, err := r.readDB.QueryContext(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	orders := []*domain.Order{}
	for rows.Next() {
		o := &domain.Order{}
		var courierID string
		err := rows.Scan(
			&o.ID, &o.OrderNumber, &o.CustomerID, &o.Model, &o.Status,
			&o.PickupLat, &o.PickupLng, &o.PickupAddress,
			&o.DropoffLat, &o.DropoffLng, &o.DropoffAddress,
			&o.Length, &o.Width, &o.Height, &o.Weight, &o.ItemDescription, &o.ItemImageURL,
			&o.DistanceKM, &o.BasePriceIDR, &o.VolumetricSurchargeIDR,
			&o.DynamicPriceIDR, &o.TotalPriceIDR, &o.HandoverToken, &o.DispatchExpiry, &o.BatchID, &o.SequenceNo, &courierID, &o.CreatedAt, &o.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		if courierID != "" {
			o.CourierID = &courierID
		}
		o.ApplyCanonicalOrderContract()
		orders = append(orders, o)
	}
	return orders, nil
}

func (r *postgresRepo) UpdateStatus(ctx context.Context, id string, status domain.OrderStatus) error {
	query := `UPDATE orders
	             SET status = $1, updated_at = $2
	           WHERE id = $3
	             AND (status = $1 OR status NOT IN ('delivered', 'cancelled'))`
	_, err := r.db.ExecContext(ctx, query, status, time.Now(), id)
	return err
}

// UpdateStatusOptimistic commits a transition only when the caller still owns
// the version it read. PostgreSQL row-level locking makes the compare-and-set
// atomic across order-service instances; terminal states cannot be resurrected
// even if a delayed worker races with a current transition.
func (r *postgresRepo) UpdateStatusOptimistic(ctx context.Context, id string, status domain.OrderStatus, expectedVersion int64) (bool, error) {
	if expectedVersion < 1 {
		expectedVersion = 1
	}
	result, err := r.db.ExecContext(ctx, `
		UPDATE orders
		   SET status = $1,
		       updated_at = $2
		 WHERE id = $3
		   AND COALESCE(state_version, 1) = $4
		   AND status NOT IN ('delivered', 'cancelled')`,
		status, time.Now(), id, expectedVersion)
	if err != nil {
		return false, err
	}
	rows, err := result.RowsAffected()
	return rows == 1, err
}

// UpdateLegsStatus — FB-121: tandai semua leg aktif order sebagai final.
// Dipakai saat order delivered/cancelled supaya gate active_jobs dispatcher
// tidak menghitung courier masih punya pekerjaan yang sudah selesai.
func (r *postgresRepo) UpdateLegsStatus(ctx context.Context, orderID string, status domain.OrderStatus) error {
	query := `UPDATE order_legs SET status = $1, updated_at = NOW()
	          WHERE order_id = $2 AND status NOT IN ('delivered', 'completed', 'cancelled', 'failed', 'rejected')`
	_, err := r.db.ExecContext(ctx, query, status, orderID)
	return err
}

// GetCourierIDByUserID — AUDIT-FIX m5: ambil courier_profiles.id milik user.
// Dipakai validasi kepemilikan: kurir hanya boleh update status order yang
// courier_id-nya = profil dia.
func (r *postgresRepo) GetCourierIDByUserID(ctx context.Context, userID string) (string, error) {
	var courierID string
	err := r.readDB.QueryRowContext(ctx,
		`SELECT id FROM courier_profiles WHERE user_id = $1`, userID).Scan(&courierID)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return courierID, err
}

// UpdateOrderAWB menyimpan nomor AWB dan URL tracking ke tabel orders.
// Dipanggil oleh payment_link_service setelah AWB berhasil dibuat via integration-gateway.
func (r *postgresRepo) UpdateOrderAWB(ctx context.Context, orderID, awbNumber, trackingURL string) error {
	query := `UPDATE orders SET awb_number = $1, tracking_url = $2, updated_at = $3 WHERE id = $4`
	_, err := r.db.ExecContext(ctx, query, awbNumber, trackingURL, time.Now(), orderID)
	return err
}

func (r *postgresRepo) UpdateDimensions(ctx context.Context, id string, length, width, height, weight float64) error {
	query := `UPDATE orders SET length = $1, width = $2, height = $3, weight = $4, updated_at = $5 WHERE id = $6`
	_, err := r.db.ExecContext(ctx, query, length, width, height, weight, time.Now(), id)
	return err
}

func (r *postgresRepo) CancelExpiredOrders(ctx context.Context, timeout time.Duration) (int64, error) {
	expiryTime := time.Now().Add(-timeout)
	rows, err := r.readDB.QueryContext(ctx, `
		SELECT id::text
		FROM orders
		WHERE status = 'pending_payment' AND created_at < $1
		ORDER BY created_at ASC`, expiryTime)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	var orderIDs []string
	for rows.Next() {
		var orderID string
		if err := rows.Scan(&orderID); err != nil {
			return 0, err
		}
		orderIDs = append(orderIDs, orderID)
	}
	if err := rows.Err(); err != nil {
		return 0, err
	}

	var cancelled int64
	for _, orderID := range orderIDs {
		result, err := r.TransitionOrder(ctx, domain.OrderTransitionRequest{
			OrderID:        orderID,
			Actor:          domain.OrderActorPlatform,
			TargetStatus:   domain.StatusCancelled,
			Reason:         "Payment timeout",
			IdempotencyKey: "payment-timeout:" + orderID,
			EventMessage:   "Pesanan dibatalkan karena pembayaran melewati batas waktu",
		})
		if err != nil {
			return cancelled, err
		}
		if result.Applied {
			cancelled++
		}
	}
	return cancelled, nil
}

func (r *postgresRepo) AssignCourier(ctx context.Context, orderID string, courierID string) error {
	if strings.TrimSpace(courierID) == "" {
		return fmt.Errorf("courier id is required")
	}
	var batchID sql.NullString
	if err := r.db.QueryRowContext(ctx, `SELECT batch_id::text FROM orders WHERE id = $1`, orderID).Scan(&batchID); err != nil {
		return err
	}
	ids := []string{orderID}
	if batchID.Valid && batchID.String != "" {
		rows, err := r.db.QueryContext(ctx, `
			SELECT id::text
			FROM orders
			WHERE batch_id = $1 AND status IN ('searching', 'failed_delivery')
			ORDER BY sequence_no, created_at`, batchID.String)
		if err != nil {
			return err
		}
		defer rows.Close()
		ids = ids[:0]
		for rows.Next() {
			var id string
			if err := rows.Scan(&id); err != nil {
				return err
			}
			ids = append(ids, id)
		}
		if err := rows.Err(); err != nil {
			return err
		}
	}

	assigned := 0
	for _, id := range ids {
		result, err := r.TransitionOrder(ctx, domain.OrderTransitionRequest{
			OrderID:             id,
			ActorID:             courierID,
			Actor:               domain.OrderActorPlatform,
			TargetStatus:        domain.StatusAssigned,
			CourierID:           courierID,
			ClearDispatchExpiry: true,
			IdempotencyKey:      "courier-assign:" + id + ":" + courierID,
			EventMessage:        "Order ditugaskan ke kurir",
		})
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				continue
			}
			return err
		}
		if result.Applied || result.Replayed {
			assigned++
		}
	}
	if assigned == 0 {
		var currentStatus domain.OrderStatus
		var currentCourier sql.NullString
		if err := r.db.QueryRowContext(ctx, `SELECT status, courier_id::text FROM orders WHERE id = $1`, orderID).Scan(&currentStatus, &currentCourier); err == nil &&
			currentStatus == domain.StatusAssigned && currentCourier.Valid && currentCourier.String == courierID {
			return nil
		}
		return sql.ErrNoRows
	}
	return nil
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
				COALESCE(length, 0), COALESCE(width, 0), COALESCE(height, 0), COALESCE(weight, 0), COALESCE(item_description, ''), COALESCE(item_image_url, ''),
				distance_km, base_price_idr, volumetric_surcharge_idr, 
				dynamic_price_idr, total_price_idr, COALESCE(handover_token, ''), COALESCE(dispatch_expiry, NOW()), COALESCE(batch_id::text, ''), sequence_no, created_at, updated_at
			  FROM orders 
			  WHERE status IN ('searching', 'dispatching') AND updated_at < $1`

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
			&o.DynamicPriceIDR, &o.TotalPriceIDR, &o.HandoverToken, &o.DispatchExpiry, &o.BatchID, &o.SequenceNo, &o.CreatedAt, &o.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		orders = append(orders, o)
	}
	return orders, nil
}

// GetGhostedAcceptedOrders — FOOD-BIKE-066: order status 'accepted' yang
// tidak ada progress (updated_at lama dari threshold). Driver accept tapi
// tidak bergerak menuju pickup → kandidat soft_ghosting.
func (r *postgresRepo) GetGhostedAcceptedOrders(ctx context.Context, timeout time.Duration) ([]*domain.Order, error) {
	query := `
		SELECT o.id, o.order_number, o.customer_id, o.model, o.status,
			COALESCE(ol.courier_id::text, ''),
			COALESCE(o.merchant_id::text, ''),
			COALESCE(o.service_sub_type, ''),
			o.created_at, o.updated_at
		FROM orders o
		JOIN order_legs ol ON ol.order_id = o.id AND ol.leg_number = 1
		WHERE o.status = 'accepted'
		  AND o.updated_at < $1
		ORDER BY o.updated_at ASC
		LIMIT 50`

	thresholdTime := time.Now().Add(-timeout)
	rows, err := r.readDB.QueryContext(ctx, query, thresholdTime)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var orders []*domain.Order
	for rows.Next() {
		o := &domain.Order{}
		var courierID, merchantID, serviceSubType string
		if err := rows.Scan(&o.ID, &o.OrderNumber, &o.CustomerID, &o.Model, &o.Status,
			&courierID, &merchantID, &serviceSubType, &o.CreatedAt, &o.UpdatedAt); err != nil {
			return nil, err
		}
		if courierID != "" {
			o.CourierID = &courierID
		}
		if merchantID != "" {
			o.MerchantID = &merchantID
		}
		o.ServiceSubType = serviceSubType
		orders = append(orders, o)
	}
	return orders, rows.Err()
}

// ReleaseGhostedOrder — FOOD-BIKE-066: lepas driver dari order ghosting.
// courier_id → NULL, status → searching, dispatch_expiry direset agar
// matching worker bisa menawarkan lagi ke driver lain.
func (r *postgresRepo) ReleaseGhostedOrder(ctx context.Context, orderID string) error {
	result, err := r.TransitionOrder(ctx, domain.OrderTransitionRequest{
		OrderID:             orderID,
		Actor:               domain.OrderActorPlatform,
		TargetStatus:        domain.StatusSearching,
		IdempotencyKey:      "ghost-release:" + orderID,
		EventMessage:        "Driver ghost dilepas dan pesanan dikembalikan ke pencarian",
		ClearCourier:        true,
		ClearDispatchExpiry: true,
	})
	if err != nil {
		return err
	}
	if !result.Applied && !result.Replayed {
		return sql.ErrNoRows
	}
	return nil
}
func (r *postgresRepo) SaveEvent(ctx context.Context, e domain.OrderEvent) error {
	query := `INSERT INTO order_events (order_id, user_id, event_type, description, created_at)
			  VALUES ($1, $2, $3, $4, $5)`

	_, err := r.db.ExecContext(ctx, query,
		e.OrderID, e.UserID, e.Status, e.Message, time.Now(),
	)
	return err
}

func (r *postgresRepo) ListEventsByUserID(ctx context.Context, userID string, since time.Time) ([]domain.OrderEvent, error) {
	query := `SELECT id, order_id, user_id, event_type, description, created_at
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
	query := `SELECT id, order_id, user_id, event_type, description, created_at
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
		SELECT mp.id, mp.name,
		       ST_Y(mp.location::geometry), ST_X(mp.location::geometry),
		       COALESCE(mp.category, ''), COALESCE(mp.address, ''), COALESCE(mp.is_active, FALSE),
		       COUNT(o.id) as usage_count,
		       COALESCE(AVG(EXTRACT(EPOCH FROM (o.updated_at - o.created_at))/60), 0) as avg_wait_time
		FROM meeting_points mp
		LEFT JOIN orders o ON o.meeting_point_id = mp.id
		GROUP BY mp.id, mp.name, mp.location, mp.category, mp.address, mp.is_active
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
		if err := rows.Scan(&a.MeetingPointID, &a.Name, &a.Latitude, &a.Longitude, &a.Category, &a.Address, &a.IsActive, &a.UsageCount, &a.AvgWaitTimeMin); err != nil {
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
	scannedByRole := scan.ScannedByRole
	if scannedByRole == "" {
		scannedByRole = "courier"
	}
	query := `INSERT INTO package_scans (
				order_id, scan_type, scanned_by, scanned_by_role, latitude, longitude, photo_url, bag_number, scanned_at
			  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
			  RETURNING id, scanned_at`

	err := r.db.QueryRowContext(ctx, query,
		scan.OrderID, scan.ScanType, scan.ScannedBy, scannedByRole, scan.Latitude, scan.Longitude, scan.PhotoURL, scan.BagNumber,
	).Scan(&scan.ID, &scan.RecordedAt)
	return err
}

func (r *postgresRepo) GetScansForOrder(ctx context.Context, orderID string) ([]*domain.PackageScan, error) {
	query := `SELECT id, order_id, scan_type, scanned_by, latitude, longitude, NULL::uuid, photo_url, bag_number, scanned_at
			  FROM package_scans
			  WHERE order_id = $1
			  ORDER BY scanned_at ASC`

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
	query := `SELECT id, order_id, scan_type, scanned_by, latitude, longitude, NULL::uuid, photo_url, bag_number, scanned_at
			  FROM package_scans
			  WHERE order_id = $1
			  ORDER BY scanned_at DESC
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
	query := `SELECT id, order_id, scan_type, scanned_by, latitude, longitude, NULL::uuid, photo_url, bag_number, scanned_at
			  FROM package_scans
			  WHERE bag_number = $1
			  ORDER BY scanned_at ASC`

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

// SaveOrderRating menyimpan rating (1-5) dan comment ke tabel orders.
// Juga menaikkan avg_rating kurir di tabel courier_profiles secara atomik.
func (r *postgresRepo) SaveOrderRating(ctx context.Context, orderID string, courierID string, rating float64, comment string) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	queryOrder := `
		UPDATE orders 
		SET courier_rating = $1, rating_comment = $2, updated_at = NOW() 
		WHERE id = $3 AND courier_rating IS NULL`

	res, err := tx.ExecContext(ctx, queryOrder, rating, comment, orderID)
	if err != nil {
		return err
	}

	affected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return fmt.Errorf("order not found or already rated")
	}

	queryCourier := `
		UPDATE courier_profiles
		SET avg_rating = ((COALESCE(avg_rating, 5.0) * COALESCE(rating_count, 0)) + $1) / (COALESCE(rating_count, 0) + 1),
			rating_count = COALESCE(rating_count, 0) + 1,
			updated_at = NOW()
		WHERE user_id = $2
	`
	_, err = tx.ExecContext(ctx, queryCourier, rating, courierID)
	if err != nil {
		return err
	}

	return tx.Commit()
}

// SaveMerchantRating menyimpan rating makanan (FOOD-BIKE-059/060).
// INSERT ke merchant_ratings + update avg_rating merchants secara atomik.
// Idempotent via UNIQUE (order_id, merchant_id) — second rating → error.
func (r *postgresRepo) SaveMerchantRating(ctx context.Context, orderID string, merchantID string, ratedBy string, rating float64, comment string) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	queryInsert := `
		INSERT INTO merchant_ratings (order_id, merchant_id, rated_by, stars, comment)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (order_id, merchant_id) DO NOTHING
		RETURNING id`
	var insertedID string
	if err := tx.QueryRowContext(ctx, queryInsert, orderID, merchantID, ratedBy, int(rating), comment).Scan(&insertedID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return fmt.Errorf("merchant already rated for this order")
		}
		return err
	}

	queryMerchant := `
		UPDATE merchants
		SET avg_rating = ((COALESCE(avg_rating, 5.0) * COALESCE(rating_count, 0)) + $1) / (COALESCE(rating_count, 0) + 1),
			rating_count = COALESCE(rating_count, 0) + 1,
			updated_at = NOW()
		WHERE id = $2`
	_, err = tx.ExecContext(ctx, queryMerchant, rating, merchantID)
	if err != nil {
		return err
	}

	return tx.Commit()
}

// GetDeliveredUnratedOrders mengambil order dengan status delivered, belum di-rating.
func (r *postgresRepo) GetDeliveredUnratedOrders(ctx context.Context, customerID string, maxReminder int, reminderIntervalHours int) ([]*domain.Order, error) {
	query := `
		SELECT 
			id, order_number, 
			COALESCE((SELECT ol.courier_id::text FROM order_legs ol WHERE ol.order_id = orders.id AND ol.leg_number = 1 LIMIT 1), ''),
			rating_reminder_count, last_rating_reminder_at 
		FROM orders 
		WHERE customer_id = $1 
		AND status = 'delivered' 
		AND courier_rating IS NULL 
		AND COALESCE(rating_reminder_count, 0) < $2 
		AND (last_rating_reminder_at IS NULL OR last_rating_reminder_at < NOW() - INTERVAL '1 hour' * $3)
		ORDER BY created_at DESC 
		LIMIT 10
	`
	rows, err := r.readDB.QueryContext(ctx, query, customerID, maxReminder, reminderIntervalHours)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var orders []*domain.Order
	for rows.Next() {
		var o domain.Order
		var cID sql.NullString
		var lra sql.NullTime
		var rrc sql.NullInt32

		if err := rows.Scan(&o.ID, &o.OrderNumber, &cID, &rrc, &lra); err != nil {
			return nil, err
		}

		if cID.Valid {
			o.CourierID = &cID.String
		}
		if lra.Valid {
			o.LastRatingReminderAt = &lra.Time
		}
		if rrc.Valid {
			o.RatingReminderCount = int(rrc.Int32)
		}

		orders = append(orders, &o)
	}

	for _, o := range orders {
		if o.CourierID != nil {
			info, err := r.GetCourierInfo(ctx, *o.CourierID)
			if err == nil && info != nil {
				o.Courier = info
			}
		}
	}

	return orders, nil
}

// IncrementRatingReminderCount menaikkan reminder_count.
func (r *postgresRepo) IncrementRatingReminderCount(ctx context.Context, orderID string) error {
	query := `
		UPDATE orders 
		SET rating_reminder_count = COALESCE(rating_reminder_count, 0) + 1,
			last_rating_reminder_at = NOW(),
			updated_at = NOW()
		WHERE id = $1
	`
	_, err := r.db.ExecContext(ctx, query, orderID)
	return err
}

// Logistics Extensions
func (r *postgresRepo) GetLogisticsProviderConfig(ctx context.Context, provider string) (float64, float64, error) {
	query := `SELECT COALESCE(discount_pct, 0), COALESCE(markup_pct, 0) FROM logistics_providers WHERE code = $1`
	var discountPct, markupPct float64
	err := r.db.QueryRowContext(ctx, query, provider).Scan(&discountPct, &markupPct)
	return discountPct, markupPct, err
}

func (r *postgresRepo) GetUserSenderName(ctx context.Context, userID string) (string, error) {
	query := `SELECT COALESCE(awb_sender_name, '') FROM users WHERE id = $1`
	var senderName string
	err := r.db.QueryRowContext(ctx, query, userID).Scan(&senderName)
	return senderName, err
}
