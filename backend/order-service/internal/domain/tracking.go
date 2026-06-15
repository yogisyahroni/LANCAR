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

// GPSIntegrityTelemetry carries client-side anti-fake GPS detection results
// alongside each GPS location sample. Used for server-side behavioral analysis.
type GPSIntegrityTelemetry struct {
	RiskScore          float64  `json:"risk_score"`
	RiskLevel          string   `json:"risk_level"` // VALID, SUSPICIOUS, FAKE_GPS_DETECTED
	IsMock             bool     `json:"is_mock"`
	MockSettingEnabled bool     `json:"mock_setting_enabled"`
	DeveloperOptions   bool     `json:"developer_options"`
	UsbDebugging       bool     `json:"usb_debugging"`
	FakeGpsApps        []string `json:"fake_gps_apps"`
	AccelerometerOk    bool     `json:"accelerometer_ok"`
	GyroscopeOk        bool     `json:"gyroscope_ok"`
	BarometerOk        bool     `json:"barometer_ok"`
	StepCounterOk      bool     `json:"step_counter_ok"`
	SensorAvailable    bool     `json:"sensor_available"`
	SensorIntegrity    bool     `json:"sensor_integrity"`
	IsRooted           bool     `json:"is_rooted"`
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
	SaveGPSLog(ctx context.Context, courierID uuid.UUID, orderID *uuid.UUID, loc GPSLocation, isSpoofed bool, telemetry *GPSIntegrityTelemetry) error
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

type PublicTrackingEvent struct {
	Status      OrderStatus `json:"status"`
	Description string      `json:"description"`
	Location    string      `json:"location,omitempty"`
	Timestamp   time.Time   `json:"timestamp"`
}

type PublicTrackingResponse struct {
	ResiNumber  string                `json:"resi_number"`
	Status      OrderStatus           `json:"status"`
	Model       string                `json:"model"`
	Origin      string                `json:"origin"`
	Destination string                `json:"destination"`
	LiveMap     *GPSLocation          `json:"live_map,omitempty"` // For ondemand
	Timeline    []PublicTrackingEvent `json:"timeline"`           // Sorted ascending
}

type TrackingService interface {
	UpdateLocation(ctx context.Context, req CourierLocationUpdate) error
	SyncLocations(ctx context.Context, req CourierLocationSyncRequest) error
	GetTrackingByOrder(ctx context.Context, orderID uuid.UUID) (*TrackingResponse, error)
	GetPublicTracking(ctx context.Context, resi string) (*PublicTrackingResponse, error)
	ProcessIdleCouriers(ctx context.Context) error
}

// ── Anti-Fake GPS Domain Types ─────────────────────────────────────

// RiskLevel represents the severity of a GPS integrity violation.
type RiskLevel string

const (
	RiskLevelValid           RiskLevel = "VALID"
	RiskLevelSuspicious      RiskLevel = "SUSPICIOUS"
	RiskLevelFakeGPSDetected RiskLevel = "FAKE_GPS_DETECTED"
)

// GraduatedAction represents an enforcement action in the graduated response system.
type GraduatedAction string

const (
	ActionNone           GraduatedAction = "NONE"
	ActionWarning        GraduatedAction = "WARNING"
	ActionTempSuspend1H  GraduatedAction = "TEMP_SUSPEND_1H"
	ActionTempSuspend24H GraduatedAction = "TEMP_SUSPEND_24H"
	ActionManualReview   GraduatedAction = "MANUAL_REVIEW"
)

// GPSViolationEvent records a single anti-fake GPS violation for audit trail.
type GPSViolationEvent struct {
	ID          uuid.UUID             `json:"id" db:"id"`
	CourierID   uuid.UUID             `json:"courier_id" db:"courier_id"`
	RiskScore   float64               `json:"risk_score" db:"risk_score"`
	RiskLevel   RiskLevel             `json:"risk_level" db:"risk_level"`
	Telemetry   GPSIntegrityTelemetry `json:"telemetry"`
	ActionTaken GraduatedAction       `json:"action_taken" db:"action_taken"`
	Latitude    float64               `json:"latitude" db:"latitude"`
	Longitude   float64               `json:"longitude" db:"longitude"`
	DeviceID    string                `json:"device_id" db:"device_id"`
	CreatedAt   time.Time             `json:"created_at" db:"created_at"`
}

// GraduatedResponseResult is the output of the graduated response engine.
type GraduatedResponseResult struct {
	Action            GraduatedAction `json:"action"`
	ViolationCount24H int             `json:"violation_count_24h"`
	ViolationCount7D  int             `json:"violation_count_7d"`
	ViolationCount30D int             `json:"violation_count_30d"`
	Message           string          `json:"message"`
}

// AntiFakeGPSRepository defines persistence for anti-fake GPS violation events.
type AntiFakeGPSRepository interface {
	InsertViolation(ctx context.Context, event GPSViolationEvent) error
	CountViolations(ctx context.Context, courierID uuid.UUID, since time.Time) (int, error)
	GetRecentViolations(ctx context.Context, courierID uuid.UUID, limit int) ([]GPSViolationEvent, error)
}

// AntiFakeGPSService defines the business logic for anti-fake GPS enforcement.
type AntiFakeGPSService interface {
	// EvaluateAndRespond processes incoming GPS telemetry, evaluates risk,
	// and applies graduated response if thresholds are exceeded.
	EvaluateAndRespond(ctx context.Context, courierID uuid.UUID, telemetry GPSIntegrityTelemetry, lat, lng float64, deviceID string) (*GraduatedResponseResult, error)
}
