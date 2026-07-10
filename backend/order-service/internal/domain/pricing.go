package domain

import (
	"context"
	"time"
)

type PricingEstimateRequest struct {
	PickupLat    float64  `json:"pickup_lat" validate:"required"`
	PickupLng    float64  `json:"pickup_lng" validate:"required"`
	DropoffLat   float64  `json:"dropoff_lat" validate:"required"`
	DropoffLng   float64  `json:"dropoff_lng" validate:"required"`
	Length       float64  `json:"length" validate:"required"`
	Width        float64  `json:"width" validate:"required"`
	Height       float64  `json:"height" validate:"required"`
	Weight       float64  `json:"weight" validate:"required"`
	Models       []string `json:"models" validate:"required"` // Requested delivery models
	IsARCore     bool     `json:"is_arcore"`
	IsVolumetric bool     `json:"is_volumetric"`
	PromoCode    string   `json:"promo_code,omitempty"`
}

type PricingEstimateResponse struct {
	EstimateID             string  `json:"estimate_id"`
	PickupAddress          string  `json:"pickup_address"`
	DropoffAddress         string  `json:"dropoff_address"`
	DistanceKM             float64 `json:"distance_km"`
	DurationMin            float64 `json:"duration_min"`
	IncludedDistanceKM     float64 `json:"included_distance_km"`
	DistanceFeeIDR         int64   `json:"distance_fee_idr"`
	BasePriceIDR           int64   `json:"base_price_idr"`
	VolumetricWeightKG     float64 `json:"volumetric_weight_kg"`
	VolumetricSurchargeIDR int64   `json:"volumetric_surcharge_idr"`
	DynamicPriceIDR        int64   `json:"dynamic_price_idr"`
	SurgeFeeIDR            int64   `json:"surge_fee_idr"`
	SurgeMultiplier        float64 `json:"surge_multiplier"`
	WeatherMultiplier      float64 `json:"weather_multiplier"`
	TrafficMultiplier      float64 `json:"traffic_multiplier"`
	InsuranceFeeIDR        int64   `json:"insurance_fee_idr"`
	DiscountIDR            int64   `json:"discount_idr"`
	PromoSubsidyIDR        int64   `json:"promo_subsidy_idr"`
	PromoCode              string  `json:"promo_code,omitempty"`
	PromoSponsor           string  `json:"promo_sponsor,omitempty"`
	MDREstimateIDR         int64   `json:"mdr_estimate_idr"`
	TaxIDR                 int64   `json:"tax_idr"`
	// PlatformFeeIDR adalah biaya layanan operasional.
	// Dikonfigurasi dari tabel delivery_service_products (platform_fee_idr, platform_fee_pct).
	// Tidak diekspos sebagai line-item ke customer — sudah tercakup dalam TotalPriceIDR.
	PlatformFeeIDR int64     `json:"platform_fee_idr"`
	PlatformFeePct float64   `json:"platform_fee_pct"`
	TotalPriceIDR  int64     `json:"total_price_idr"`
	ExpiresAt      time.Time `json:"expires_at"`

	// Original coords for order creation
	PickupLat  float64 `json:"pickup_lat"`
	PickupLng  float64 `json:"pickup_lng"`
	DropoffLat float64 `json:"dropoff_lat"`
	DropoffLng float64 `json:"dropoff_lng"`
	Model      string  `json:"model"` // Selected delivery model
	Length     float64 `json:"length,omitempty"`
	Width      float64 `json:"width,omitempty"`
	Height     float64 `json:"height,omitempty"`
	Weight     float64 `json:"weight,omitempty"`
}

type PricingConfig struct {
	BaseFare          int64              `json:"base_fare"`
	PricePerKM        int64              `json:"price_per_km"`
	PricePerMin       int64              `json:"price_per_min"`
	SurgeEnabled      bool               `json:"surge_enabled"`
	WeatherMultiplier float64            `json:"weather_multiplier"`
	TrafficMultiplier float64            `json:"traffic_multiplier"`
	ZoneMultipliers   map[string]float64 `json:"zone_multipliers"`
	VolumetricDiv     float64            `json:"volumetric_div"` // default 6000
}

type PricingService interface {
	EstimatePrice(ctx context.Context, req *PricingEstimateRequest) (*PricingEstimateResponse, error)
	GetConfig(ctx context.Context) (*PricingConfig, error)
	UpdateConfig(ctx context.Context, config *PricingConfig) error
	SimulatePrice(ctx context.Context, req *PricingEstimateRequest) (*PricingEstimateResponse, error)
	CalculateMerchantFee(ctx context.Context, itemPrice int64) int64
}

type DeliveryServiceProduct struct {
	Code               string    `json:"code"`
	Name               string    `json:"name"`
	BaseFareIDR        int64     `json:"base_fare_idr"`
	PerKmIDR           int64     `json:"per_km_idr"`
	IncludedDistanceKM float64   `json:"included_distance_km"`
	UsesSizeTier       bool      `json:"uses_size_tier"`
	MaxDistanceKM      *float64  `json:"max_distance_km"`
	MaxWeightKG        *float64  `json:"max_weight_kg"`
	PlatformFeeIDR     int64     `json:"platform_fee_idr"`
	PlatformFeePct     float64   `json:"platform_fee_pct"`
	ExtraDropoffFeeIDR int64     `json:"extra_dropoff_fee_idr"`
	SearchRadiiKM      []float64 `json:"search_radii_km"`
}

type PricingRepository interface {
	GetActiveConfig(ctx context.Context, model string) (*PricingConfig, error)
	GetDeliveryServiceByCode(ctx context.Context, code string) (*DeliveryServiceProduct, error)
	UpdateConfig(ctx context.Context, config *PricingConfig) error
	CheckCoverage(ctx context.Context, lat, lng float64) (bool, error)
}

type Waypoint struct {
	Lat float64 `json:"lat"`
	Lng float64 `json:"lng"`
}

type OptimizedRouteResult struct {
	DistanceKM       float64
	DurationMin      float64
	OptimizedIndices []int
}

type MapsRepository interface {
	GetDistanceMatrix(ctx context.Context, originLat, originLng, destLat, destLng float64, useTraffic bool) (distanceKM float64, durationMin float64, originAddr, destAddr string, err error)
	OptimizeWaypoints(ctx context.Context, origin Waypoint, waypoints []Waypoint, dest Waypoint, useTraffic bool) (*OptimizedRouteResult, error)
}

type RedisRepository interface {
	SaveEstimate(ctx context.Context, estimate *PricingEstimateResponse) error
	GetEstimate(ctx context.Context, estimateID string) (*PricingEstimateResponse, error)
	GetConfig(ctx context.Context) (*PricingConfig, error)
	UpdateConfig(ctx context.Context, config *PricingConfig) error
	GetMultiplier(ctx context.Context, zoneID string) (float64, error)

	// Courier GEO methods
	UpdateCourierLocation(ctx context.Context, courierID string, lat, lng float64) error
	FindNearbyCouriers(ctx context.Context, lat, lng float64, radiusKM float64) ([]string, error)

	// Distributed Lock
	AcquireLock(ctx context.Context, key string, expiration time.Duration) (bool, error)
	ReleaseLock(ctx context.Context, key string) error
}

type EventBus interface {
	Publish(ctx context.Context, topic string, payload interface{}) error
	Subscribe(ctx context.Context, topic string) (<-chan string, error)
}
