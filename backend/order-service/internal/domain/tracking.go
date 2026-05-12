package domain

import (
	"context"
	"time"

	"github.com/google/uuid"
)

type GPSLocation struct {
	Latitude  float64    `json:"latitude" validate:"required,latitude"`
	Longitude float64    `json:"longitude" validate:"required,longitude"`
	Accuracy  float64    `json:"accuracy"` // in meters
	Heading   float64    `json:"heading"`  // in degrees
	Speed     float64    `json:"speed"`    // in km/h
	Timestamp time.Time  `json:"timestamp" validate:"required"`
	OrderID   *uuid.UUID `json:"order_id,omitempty"` // Link to delivery context if active
}

type CourierLocationSyncRequest struct {
	CourierID uuid.UUID     `json:"courier_id" validate:"required"`
	DeviceID  string        `json:"device_id"`
	Locations []GPSLocation `json:"locations" validate:"required,min=1"`
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

// GeofenceCheckResult contains the result of a PostGIS geofence spatial query.
type GeofenceCheckResult struct {
	IsInsideZone     bool    `db:"is_inside_zone"`
	OutOfZoneMinutes int     `db:"out_of_zone_minutes"` // minutes since first out-of-zone GPS log, 0 if inside
	AssignedZoneID   *string `db:"zone_id"`
}

type TrackingRepository interface {
	SaveGPSLog(ctx context.Context, courierID uuid.UUID, orderID *uuid.UUID, loc GPSLocation, isSpoofed bool) error
	UpdateCourierLocation(ctx context.Context, courierID uuid.UUID, loc GPSLocation) error
	GetLatestLocation(ctx context.Context, courierID uuid.UUID) (*GPSLocation, error)
	GetIdleCouriers(ctx context.Context, thresholdMinutes int) ([]uuid.UUID, error)
	SetCourierOffline(ctx context.Context, courierID uuid.UUID) error
	GetActiveCourierForOrder(ctx context.Context, orderID uuid.UUID) (*uuid.UUID, error)

	// CheckGeofence performs a PostGIS ST_Contains spatial query to verify if the courier
	// is inside their assigned zone polygon. Returns IsInsideZone=true (safe default)
	// if the courier has no active order leg with an assigned zone.
	CheckGeofence(ctx context.Context, courierID uuid.UUID, lat, lng float64) (*GeofenceCheckResult, error)
}

type TrackingService interface {
	UpdateLocation(ctx context.Context, req CourierLocationUpdate) error
	SyncLocations(ctx context.Context, req CourierLocationSyncRequest) error
	GetTrackingByOrder(ctx context.Context, orderID uuid.UUID) (*TrackingResponse, error)
	ProcessIdleCouriers(ctx context.Context) error
}
