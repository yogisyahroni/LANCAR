package domain

import (
	"context"
	"time"
)

type PricingEstimateRequest struct {
	PickupLat  float64  `json:"pickup_lat" validate:"required"`
	PickupLng  float64  `json:"pickup_lng" validate:"required"`
	DropoffLat float64  `json:"dropoff_lat" validate:"required"`
	DropoffLng float64  `json:"dropoff_lng" validate:"required"`
	Length     float64  `json:"length" validate:"required"`
	Width      float64  `json:"width" validate:"required"`
	Height     float64  `json:"height" validate:"required"`
	Weight     float64  `json:"weight" validate:"required"`
	Models     []string `json:"models" validate:"required"` // Requested delivery models
}

type PricingEstimateResponse struct {
	EstimateID             string    `json:"estimate_id"`
	PickupAddress          string    `json:"pickup_address"`
	DropoffAddress         string    `json:"dropoff_address"`
	DistanceKM             float64   `json:"distance_km"`
	DurationMin            float64   `json:"duration_min"`
	BasePriceIDR           int64     `json:"base_price_idr"`
	VolumetricSurchargeIDR int64     `json:"volumetric_surcharge_idr"`
	DynamicPriceIDR        int64     `json:"dynamic_price_idr"`
	// PlatformFeeIDR adalah biaya layanan operasional (OTP, payment gateway, dll).
	// Dikonfigurasi via admin panel (system_configs key: 'platform_fee_idr').
	// Tidak diekspos sebagai line-item ke customer — sudah tercakup dalam TotalPriceIDR.
	PlatformFeeIDR         int64     `json:"platform_fee_idr"`
	TotalPriceIDR          int64     `json:"total_price_idr"`
	ExpiresAt              time.Time `json:"expires_at"`

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
	BaseFare          float64            `json:"base_fare"`
	PricePerKM        float64            `json:"price_per_km"`
	PricePerMin       float64            `json:"price_per_min"`
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
}

type DeliveryServiceProduct struct {
	Code                   string  `json:"code"`
	Name                   string  `json:"name"`
	BaseFareIDR            float64 `json:"base_fare_idr"`
	PerKmIDR               float64 `json:"per_km_idr"`
	IncludedDistanceKM     float64 `json:"included_distance_km"`
	UsesSizeTier           bool    `json:"uses_size_tier"`
	MaxDistanceKM          *float64 `json:"max_distance_km"`
	MaxWeightKG            *float64 `json:"max_weight_kg"`
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
	GetDistanceMatrix(ctx context.Context, originLat, originLng, destLat, destLng float64) (distanceKM float64, durationMin float64, originAddr, destAddr string, err error)
	OptimizeWaypoints(ctx context.Context, origin Waypoint, waypoints []Waypoint, dest Waypoint) (*OptimizedRouteResult, error)
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
