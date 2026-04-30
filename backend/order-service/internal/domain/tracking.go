package domain

import (
	"context"
	"time"

	"github.com/google/uuid"
)

type GPSLocation struct {
	Latitude  float64   `json:"latitude" validate:"required,latitude"`
	Longitude float64   `json:"longitude" validate:"required,longitude"`
	Accuracy  float64   `json:"accuracy"` // in meters
	Heading   float64   `json:"heading"`  // in degrees
	Speed     float64   `json:"speed"`    // in km/h
	Timestamp time.Time `json:"timestamp" validate:"required"`
}

type CourierLocationUpdate struct {
	CourierID uuid.UUID   `json:"courier_id" validate:"required"`
	OrderID   *uuid.UUID  `json:"order_id,omitempty"` // If on delivery
	Location  GPSLocation `json:"location" validate:"required"`
}

type TrackingResponse struct {
	CourierID     uuid.UUID   `json:"courier_id"`
	Location      GPSLocation `json:"location"`
	ETA           string      `json:"eta,omitempty"`
	RoutePolyline string      `json:"route_polyline,omitempty"`
}

type TrackingRepository interface {
	SaveGPSLog(ctx context.Context, courierID uuid.UUID, orderID *uuid.UUID, loc GPSLocation, isSpoofed bool) error
	UpdateCourierLocation(ctx context.Context, courierID uuid.UUID, loc GPSLocation) error
	GetLatestLocation(ctx context.Context, courierID uuid.UUID) (*GPSLocation, error)
	GetIdleCouriers(ctx context.Context, thresholdMinutes int) ([]uuid.UUID, error)
	SetCourierOffline(ctx context.Context, courierID uuid.UUID) error
	GetActiveCourierForOrder(ctx context.Context, orderID uuid.UUID) (*uuid.UUID, error)
}

type TrackingService interface {
	UpdateLocation(ctx context.Context, req CourierLocationUpdate) error
	GetTrackingByOrder(ctx context.Context, orderID uuid.UUID) (*TrackingResponse, error)
	ProcessIdleCouriers(ctx context.Context) error
}
