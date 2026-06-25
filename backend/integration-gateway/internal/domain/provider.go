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
