package domain

import "context"

// OTPProvider defines the interface for an external OTP provider (e.g. Zenziva, Twilio)
type OTPProvider interface {
	SendWA(ctx context.Context, to, message string) error
	SendSMS(ctx context.Context, to, message string) error
}

// PaymentProvider defines the interface for an external Payment Gateway (e.g. Midtrans, Xendit)
type PaymentProvider interface {
	CreateInvoice(ctx context.Context, req InvoiceRequest) (*InvoiceResponse, error)
	CreateDisbursement(ctx context.Context, req DisbursementRequest) (*DisbursementResponse, error)
}

type InvoiceRequest struct {
	ReferenceID   string
	Amount        int64
	Description   string
	CustomerName  string
	CustomerEmail string
}

type InvoiceResponse struct {
	InvoiceURL string
	Token      string // Specific to Midtrans Snap
}

type DisbursementRequest struct {
	ReferenceID        string
	Amount             int64
	BeneficiaryName    string
	BeneficiaryAccount string
	BeneficiaryBank    string
	Notes              string
}

type DisbursementResponse struct {
	Status string
}

// MapsProvider defines the interface for an external Maps service (e.g. TomTom, Google Maps)
type MapsProvider interface {
	GetDistanceMatrix(ctx context.Context, originLat, originLng, destLat, destLng float64, useTraffic bool) (distanceKM float64, durationMin float64, originAddr, destAddr string, err error)
	OptimizeWaypoints(ctx context.Context, origin Waypoint, waypoints []Waypoint, dest Waypoint, useTraffic bool) (*OptimizedRouteResult, error)
}

type Waypoint struct {
	Lat float64 `json:"lat"`
	Lng float64 `json:"lng"`
}

type OptimizedRouteResult struct {
	DistanceKM       float64 `json:"distance_km"`
	DurationMin      float64 `json:"duration_min"`
	OptimizedIndices []int   `json:"optimized_indices"`
}

// LogisticsProvider is the small identity contract shared by every logistics
// adapter. Operational capabilities are deliberately modelled as separate
// interfaces below so an adapter never has to fake an unsupported operation.
type LogisticsProvider interface {
	Identity() ProviderIdentity
	Capabilities() []Capability
}

// TariffProvider calculates provider-owned shipping options.
type TariffProvider interface {
	CheckTariff(ctx context.Context, req TariffRequest) (*TariffResponse, error)
}

// ShipmentProvider creates a shipment and returns the provider's native AWB.
type ShipmentProvider interface {
	CreateOrder(ctx context.Context, req LogisticsOrderRequest) (*LogisticsOrderResponse, error)
}

// TrackingPullProvider retrieves the latest tracking state from a provider.
type TrackingPullProvider interface {
	TrackOrder(ctx context.Context, awb string) (*TrackingResponse, error)
}

// Logistics3PLProvider is retained as a compatibility alias for callers that
// still require the original three-operation provider contract. New code
// should depend on LogisticsProvider plus only the capability it needs.
type Logistics3PLProvider interface {
	LogisticsProvider
	TariffProvider
	ShipmentProvider
	TrackingPullProvider
}

type TariffRequest struct {
	OriginCode      string  `json:"origin_code"`
	DestinationCode string  `json:"destination_code"`
	WeightKG        float64 `json:"weight_kg"`
	ServiceType     string  `json:"service_type"` // e.g., REG, YES, EZ
}

type TariffResponse struct {
	Provider     string                `json:"provider"`
	ProviderID   string                `json:"provider_id,omitempty"`
	ProviderCode string                `json:"provider_code,omitempty"`
	ProviderName string                `json:"provider_name,omitempty"`
	Services     []TariffServiceOption `json:"services"`
}

type TariffServiceOption struct {
	ServiceCode   string `json:"service_code"`
	ServiceName   string `json:"service_name"`
	TariffGross   int64  `json:"tariff_gross"` // Harga kotor dari provider (dalam IDR)
	EstimatedDays string `json:"estimated_days"`
}

type LogisticsOrderRequest struct {
	ReferenceID     string  `json:"reference_id"`
	SenderName      string  `json:"sender_name"`
	SenderPhone     string  `json:"sender_phone"`
	SenderAddress   string  `json:"sender_address"`
	SenderCity      string  `json:"sender_city"`
	SenderZipCode   string  `json:"sender_zip_code"`
	ReceiverName    string  `json:"receiver_name"`
	ReceiverPhone   string  `json:"receiver_phone"`
	ReceiverAddress string  `json:"receiver_address"`
	ReceiverCity    string  `json:"receiver_city"`
	ReceiverZipCode string  `json:"receiver_zip_code"`
	OriginCode      string  `json:"origin_code"`
	DestinationCode string  `json:"destination_code"`
	WeightKG        float64 `json:"weight_kg"`
	ItemDescription string  `json:"item_description"`
	ItemValue       int64   `json:"item_value"`
	ServiceType     string  `json:"service_type"`
}

type LogisticsOrderResponse struct {
	ReferenceID string `json:"reference_id"`
	AWBNumber   string `json:"awb_number"`
	Provider    string `json:"provider"`
	ServiceType string `json:"service_type"`
	BookingCode string `json:"booking_code"`
	TotalAmount int64  `json:"total_amount"`
}

type TrackingResponse struct {
	AWBNumber    string          `json:"awb_number"`
	Provider     string          `json:"provider"`
	Status       string          `json:"status"` // e.g., MANIFESTED, IN_TRANSIT, DELIVERED
	StatusDetail string          `json:"status_detail"`
	History      []TrackingEvent `json:"history"`
}

type TrackingEvent struct {
	Timestamp string `json:"timestamp"`
	Status    string `json:"status"`
	Location  string `json:"location"`
	Note      string `json:"note"`
}
