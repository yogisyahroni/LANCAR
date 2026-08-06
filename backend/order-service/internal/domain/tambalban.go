package domain

import (
	"context"
	"time"
)

// ============================================================
// TAMBAL BAN & TOWING — Service Types
// ============================================================

type ServiceSubType string

const (
	ServiceSubTypeTambalBanMotor ServiceSubType = "tambal_ban_motor"
	ServiceSubTypeTambalBanMobil ServiceSubType = "tambal_ban_mobil"
	ServiceSubTypeTowingMotor    ServiceSubType = "towing_motor"
	ServiceSubTypeTowingMobil    ServiceSubType = "towing_mobil"
)

type ServiceCategory string

const (
	ServiceCategoryTambalBan ServiceCategory = "tambal_ban"
	ServiceCategoryTowing    ServiceCategory = "towing"
	ServiceCategoryOnDemand  ServiceCategory = "on_demand"
)

// ============================================================
// SETTLEMENT — Dual Model
// ============================================================

type SettlementBasis string

const (
	SettlementBasisPool  SettlementBasis = "pool"   // Model A: 20% from entire pool
	SettlementBasisPerKM SettlementBasis = "per_km" // Model B: 20% from BaseFare + PerKM only
)

type SettlementConfig struct {
	ID                     string          `json:"id" db:"id"`
	ServiceCode            string          `json:"service_code" db:"service_code"`
	ServiceCategory        string          `json:"service_category" db:"service_category"`
	CommissionBasis        SettlementBasis `json:"commission_basis" db:"commission_basis"`
	PlatformCommissionPct  float64         `json:"platform_commission_pct" db:"platform_commission_pct"`
	MDRPct                 float64         `json:"mdr_pct" db:"mdr_pct"`
	TaxPct                 float64         `json:"tax_pct" db:"tax_pct"`
	CourierKeepsServiceFee bool            `json:"courier_keeps_service_fee" db:"courier_keeps_service_fee"`
	CourierKeepsBaseFee    bool            `json:"courier_keeps_base_fee" db:"courier_keeps_base_fee"`
	CourierKeepsToll       bool            `json:"courier_keeps_toll" db:"courier_keeps_toll"`
	CreatedAt              time.Time       `json:"created_at" db:"created_at"`
	UpdatedAt              time.Time       `json:"updated_at" db:"updated_at"`
}

type SettlementResult struct {
	// Gross breakdown
	GrossTotal     int64 `json:"gross_total"`
	MDRAmount      int64 `json:"mdr_amount"`
	TaxAmount      int64 `json:"tax_amount"`
	InsuranceFee   int64 `json:"insurance_fee"`
	OperationalPool int64 `json:"operational_pool"`

	// Commission calculation
	CommissionBasis         string  `json:"commission_basis"`
	PerKMRevenue            int64   `json:"per_km_revenue"`
	BaseFareRevenue         int64   `json:"base_fare_revenue"`
	PlatformCommissionPct   float64 `json:"platform_commission_pct"`
	PlatformCommissionAmt   int64   `json:"platform_commission_amount"`

	// Courier earnings breakdown
	CourierServiceFee    int64 `json:"courier_service_fee"`
	CourierBaseFee       int64 `json:"courier_base_fee"`
	CourierTollReimburse int64 `json:"courier_toll_reimburse"`
	CourierPerKMEarning  int64 `json:"courier_per_km_earning"`
	EstimatedNetEarnings int64 `json:"estimated_net_earnings"`

	// Metadata
	SettlementModel  string   `json:"settlement_model"`
	AppliesToService []string `json:"applies_to_service"`
}

// ============================================================
// COURIER AVAILABILITY — State Machine
// ============================================================

type CourierAvailabilityState struct {
	CourierID          string     `json:"courier_id" db:"courier_id"`
	CurrentState       string     `json:"current_state" db:"current_state"`
	ActiveOrderID      *string    `json:"active_order_id,omitempty" db:"active_order_id"`
	ActiveOrderType    *string    `json:"active_order_type,omitempty" db:"active_order_type"`
	Latitude           float64    `json:"latitude" db:"latitude"`
	Longitude          float64    `json:"longitude" db:"longitude"`
	LastLocationUpdate *time.Time `json:"last_location_update,omitempty" db:"last_location_update"`
	CreatedAt          time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at" db:"updated_at"`
}

const (
	AvailabilityStateIdle               = "idle"
	AvailabilityStateNavigatingToPickup = "navigating_to_pickup"
	AvailabilityStateAtPickup           = "at_pickup"
	AvailabilityStateOnSite             = "on_site"
	AvailabilityStateInTransit          = "in_transit"
	AvailabilityStateReturning          = "returning"
)

// ============================================================
// COURIER SERVICE PRICES
// ============================================================

type CourierServicePrice struct {
	ID          string    `json:"id" db:"id"`
	CourierID   string    `json:"courier_id" db:"courier_id"`
	ServiceCode string    `json:"service_code" db:"service_code"`
	PriceAmount int64     `json:"price_amount" db:"price_amount"`
	MinPrice    int64     `json:"min_price" db:"min_price"`
	MaxPrice    int64     `json:"max_price" db:"max_price"`
	IsActive    bool      `json:"is_active" db:"is_active"`
	CreatedAt   time.Time `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time `json:"updated_at" db:"updated_at"`
}

// ============================================================
// NEARBY COURIERS — Search Response
// ============================================================

type NearbyCourier struct {
	CourierID           string  `json:"courier_id"`
	CourierName         string  `json:"courier_name"`
	Rating              float64 `json:"rating"`
	DistanceKM          float64 `json:"distance_km"`
	CourierServicePrice int64   `json:"courier_service_price"`
	ETAMinutes          int     `json:"eta_minutes"`
	VehicleType         string  `json:"vehicle_type"`
	VehicleTypeCar      *string `json:"vehicle_type_car,omitempty"`
	ServiceSubType      string  `json:"service_sub_type"`
	Status              string  `json:"status"`              // available, conditional
	StatusText          string  `json:"status_text"`         // "Siap melayani", "Dalam perjalanan (~8 menit)"
	RadiusMaxKM         int     `json:"radius_max_km" db:"radius_max_km"`
}

type NearbyCouriersResponse struct {
	Couriers   []NearbyCourier `json:"couriers"`
	Count      int             `json:"count"`
	PriceRange PriceRange      `json:"price_range"`
}

type PriceRange struct {
	Min int64 `json:"min"`
	Max int64 `json:"max"`
	Avg int64 `json:"avg"`
}

// ============================================================
// SERVICE REPORTS
// ============================================================

type TambalBanReport struct {
	ID                    string     `json:"id" db:"id"`
	OrderID               string     `json:"order_id" db:"order_id"`
	CourierID             string     `json:"courier_id" db:"courier_id"`
	TireConditionBefore   *string    `json:"tire_condition_before,omitempty" db:"tire_condition_before"`
	TirePhotoBeforeURL    *string    `json:"tire_photo_before_url,omitempty" db:"tire_photo_before_url"`
	ServiceDurationMins   *int       `json:"service_duration_minutes,omitempty" db:"service_duration_minutes"`
	MaterialsUsed         *string    `json:"materials_used,omitempty" db:"materials_used"`
	Notes                 *string    `json:"notes,omitempty" db:"notes"`
	TireConditionAfter    *string    `json:"tire_condition_after,omitempty" db:"tire_condition_after"`
	TirePhotoAfterURL     *string    `json:"tire_photo_after_url,omitempty" db:"tire_photo_after_url"`
	CompletedAt           *time.Time `json:"completed_at,omitempty" db:"completed_at"`
	CreatedAt             time.Time  `json:"created_at" db:"created_at"`
}

type TowingReport struct {
	ID                    string     `json:"id" db:"id"`
	OrderID               string     `json:"order_id" db:"order_id"`
	CourierID             string     `json:"courier_id" db:"courier_id"`
	VehicleConditionBefore *string   `json:"vehicle_condition_before,omitempty" db:"vehicle_condition_before"`
	VehiclePhotoBeforeURL *string    `json:"vehicle_photo_before_url,omitempty" db:"vehicle_photo_before_url"`
	OdometerReading       *int       `json:"odometer_reading,omitempty" db:"odometer_reading"`
	LoadingPhotoURL       *string    `json:"loading_photo_url,omitempty" db:"loading_photo_url"`
	LoadingStartedAt      *time.Time `json:"loading_started_at,omitempty" db:"loading_started_at"`
	TransitStartedAt      *time.Time `json:"transit_started_at,omitempty" db:"transit_started_at"`
	TransitEndedAt        *time.Time `json:"transit_ended_at,omitempty" db:"transit_ended_at"`
	UnloadingPhotoURL     *string    `json:"unloading_photo_url,omitempty" db:"unloading_photo_url"`
	UnloadingCompletedAt  *time.Time `json:"unloading_completed_at,omitempty" db:"unloading_completed_at"`
	OdometerAfter         *int       `json:"odometer_after,omitempty" db:"odometer_after"`
	CompletionPhotoURL    *string    `json:"completion_photo_url,omitempty" db:"completion_photo_url"`
	SignatureURL          *string    `json:"signature_url,omitempty" db:"signature_url"`
	CompletedAt           *time.Time `json:"completed_at,omitempty" db:"completed_at"`
	Notes                 *string    `json:"notes,omitempty" db:"notes"`
	CreatedAt             time.Time  `json:"created_at" db:"created_at"`
}

// ============================================================
// INTERFACES — Repository
// ============================================================

type SettlementRepository interface {
	GetSettlementConfig(ctx context.Context, serviceCode string) (*SettlementConfig, error)
	GetAllSettlementConfigs(ctx context.Context) ([]*SettlementConfig, error)
}

type AvailabilityRepository interface {
	GetAvailabilityState(ctx context.Context, courierID string) (*CourierAvailabilityState, error)
	UpsertAvailabilityState(ctx context.Context, state *CourierAvailabilityState) error
	FindCouriersByCapability(ctx context.Context, serviceSubType string, radiusKM float64, lat, lng float64) ([]*NearbyCourier, error)
	GetCourierServicePrice(ctx context.Context, courierID, serviceCode string) (int64, error)
	EstimateDistanceKM(ctx context.Context, lat1, lng1, lat2, lng2 float64) (float64, error)
	GetCourierVehicleType(ctx context.Context, courierID string) (vehicleType string, vehicleTypeCar *string, err error)
	GetActiveOrderRemainingMinutes(ctx context.Context, courierID string) (int, error)
	// UpdateCourierRadius — FOOD-BIKE-029: set radius_max_km driver
	// (dropdown 1-20 km, CHECK constraint di DB). driver food delivery
	// mengatur radius jangkauan sendiri.
	UpdateCourierRadius(ctx context.Context, courierID string, radiusKM int) error
}

type ServiceReportRepository interface {
	CreateTambalBanReport(ctx context.Context, report *TambalBanReport) error
	GetTambalBanReportByOrderID(ctx context.Context, orderID string) (*TambalBanReport, error)
	CreateTowingReport(ctx context.Context, report *TowingReport) error
	GetTowingReportByOrderID(ctx context.Context, orderID string) (*TowingReport, error)
}

// ============================================================
// INTERFACES — Service
// ============================================================

type SettlementService interface {
	CalculateSettlement(ctx context.Context, orderID, serviceCode string, grossTotal int64, distanceKM float64, baseFare int64, perKMRate int64, courierServicePrice, tollCost, insuranceFee int64) (*SettlementResult, error)
	GetSettlementConfig(ctx context.Context, serviceCode string) (*SettlementConfig, error)
}

type AvailabilityService interface {
	UpdateCourierState(ctx context.Context, courierID, newState string, orderID *string) error
	FindAvailableCouriers(ctx context.Context, serviceSubType string, customerLat, customerLng float64, radiusKM float64) (*NearbyCouriersResponse, error)
	GetCourierAvailability(ctx context.Context, courierID string) (*CourierAvailabilityState, error)
	// UpdateRadius — FOOD-BIKE-029: set radius_max_km driver food delivery.
	UpdateRadius(ctx context.Context, courierID string, radiusKM int) error
}

type VehicleValidator interface {
	ValidateCourierVehicle(ctx context.Context, courierID, serviceSubType string) (bool, error)
	GetAllowedVehicleTypes(serviceSubType string) []string
}

type ServiceReportService interface {
	CreateTambalBanReport(ctx context.Context, report *TambalBanReport) error
	GetTambalBanReport(ctx context.Context, orderID string) (*TambalBanReport, error)
	CreateTowingReport(ctx context.Context, report *TowingReport) error
	GetTowingReport(ctx context.Context, orderID string) (*TowingReport, error)
}
