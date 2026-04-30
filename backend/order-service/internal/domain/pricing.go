package domain

import (
	"context"
	"time"
)

type PricingEstimateRequest struct {
	PickupLat  float64 `json:"pickup_lat" validate:"required"`
	PickupLng  float64 `json:"pickup_lng" validate:"required"`
	DropoffLat float64 `json:"dropoff_lat" validate:"required"`
	DropoffLng float64 `json:"dropoff_lng" validate:"required"`
	Length     float64 `json:"length" validate:"required"`
	Width      float64 `json:"width" validate:"required"`
	Height     float64 `json:"height" validate:"required"`
	Weight     float64 `json:"weight" validate:"required"`
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
	TotalPriceIDR          int64     `json:"total_price_idr"`
	ExpiresAt              time.Time `json:"expires_at"`

	// Original coords for order creation
	PickupLat  float64 `json:"pickup_lat"`
	PickupLng  float64 `json:"pickup_lng"`
	DropoffLat float64 `json:"dropoff_lat"`
	DropoffLng float64 `json:"dropoff_lng"`
}

type PricingConfig struct {
	ID            string  `json:"id"`
	BaseFare      int64   `json:"base_fare"`
	PerKMFare     int64   `json:"per_km_fare"`
	PerKGFare     int64   `json:"per_kg_fare"`
	MinFare       int64   `json:"min_fare"`
	VolumetricDiv float64 `json:"volumetric_div"` // default 6000
}

type PricingService interface {
	Estimate(ctx context.Context, req PricingEstimateRequest) (*PricingEstimateResponse, error)
	GetConfig(ctx context.Context) (*PricingConfig, error)
}

type PricingRepository interface {
	GetActiveConfig(ctx context.Context) (*PricingConfig, error)
}

type MapsRepository interface {
	GetDistanceMatrix(ctx context.Context, originLat, originLng, destLat, destLng float64) (distanceKM float64, durationMin float64, originAddr, destAddr string, err error)
}

type RedisRepository interface {
	SaveEstimate(ctx context.Context, estimate *PricingEstimateResponse) error
	GetEstimate(ctx context.Context, estimateID string) (*PricingEstimateResponse, error)
	GetMultiplier(ctx context.Context) (float64, error)
}
