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
	Amount        float64
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
	Amount             float64
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

// Logistics3PLProvider defines the interface for an external 3PL logistics provider (e.g. JNE, J&T Express)
type Logistics3PLProvider interface {
	CheckTariff(ctx context.Context, req TariffRequest) (*TariffResponse, error)
	CreateOrder(ctx context.Context, req LogisticsOrderRequest) (*LogisticsOrderResponse, error)
	TrackOrder(ctx context.Context, awb string) (*TrackingResponse, error)
}

type TariffRequest struct {
	OriginCode      string  `json:"origin_code"`
	DestinationCode string  `json:"destination_code"`
	WeightKG        float64 `json:"weight_kg"`
	ServiceType     string  `json:"service_type"` // e.g., REG, YES, EZ
}

type TariffResponse struct {
	Provider string                `json:"provider"`
	Services []TariffServiceOption `json:"services"`
}

type TariffServiceOption struct {
	ServiceCode   string  `json:"service_code"`
	ServiceName   string  `json:"service_name"`
	TariffAmount  float64 `json:"tariff_amount"`
	EstimatedDays string  `json:"estimated_days"`
}

type LogisticsOrderRequest struct {
	ReferenceID     string  `json:"reference_id"`
	SenderName      string  `json:"sender_name"`
	SenderPhone     string  `json:"sender_phone"`
	SenderAddress   string  `json:"sender_address"`
	ReceiverName    string  `json:"receiver_name"`
	ReceiverPhone   string  `json:"receiver_phone"`
	ReceiverAddress string  `json:"receiver_address"`
	OriginCode      string  `json:"origin_code"`
	DestinationCode string  `json:"destination_code"`
	WeightKG        float64 `json:"weight_kg"`
	ItemDescription string  `json:"item_description"`
	ItemValue       float64 `json:"item_value"`
	ServiceType     string  `json:"service_type"`
}

type LogisticsOrderResponse struct {
	ReferenceID string  `json:"reference_id"`
	AWBNumber   string  `json:"awb_number"`
	Provider    string  `json:"provider"`
	ServiceType string  `json:"service_type"`
	BookingCode string  `json:"booking_code"`
	TotalAmount float64 `json:"total_amount"`
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
