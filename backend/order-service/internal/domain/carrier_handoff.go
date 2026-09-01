package domain

import (
	"context"
	"time"
)

// FirstMileMode describes who physically moves a parcel to the external carrier.
// It is resolved from provider capability configuration, never from a UI default.
type FirstMileMode string

const (
	FirstMileLancarPickup    FirstMileMode = "lancar_pickup"
	FirstMileProviderPickup  FirstMileMode = "provider_pickup"
	FirstMileCustomerDropoff FirstMileMode = "customer_dropoff"
)

type AWBCreationStatus string

const (
	AWBCreationPending AWBCreationStatus = "pending"
	AWBCreationCreated AWBCreationStatus = "created"
	AWBCreationFailed  AWBCreationStatus = "failed"
)

type CarrierHandoffStatus string

const (
	CarrierHandoffRecorded CarrierHandoffStatus = "recorded"
	CarrierHandoffAccepted CarrierHandoffStatus = "accepted"
	CarrierHandoffRejected CarrierHandoffStatus = "rejected"
)

type AWBAttempt struct {
	ID             string            `json:"id"`
	OrderID        string            `json:"order_id"`
	IdempotencyKey string            `json:"idempotency_key"`
	Provider       string            `json:"provider"`
	FirstMileMode  FirstMileMode     `json:"first_mile_mode"`
	Status         AWBCreationStatus `json:"status"`
	AWBNumber      string            `json:"awb_number,omitempty"`
	TrackingURL    string            `json:"tracking_url,omitempty"`
	ErrorMessage   string            `json:"error_message,omitempty"`
	CreatedAt      time.Time         `json:"created_at"`
	UpdatedAt      time.Time         `json:"updated_at"`
}

type CarrierHandoff struct {
	ID              string               `json:"id"`
	AWBAttemptID    string               `json:"awb_attempt_id"`
	OrderID         string               `json:"order_id"`
	Provider        string               `json:"provider"`
	AWBNumber       string               `json:"awb_number"`
	FirstMileMode   FirstMileMode        `json:"first_mile_mode"`
	Status          CarrierHandoffStatus `json:"status"`
	HandedOffAt     time.Time            `json:"handed_off_at"`
	LocationLat     *float64             `json:"location_lat,omitempty"`
	LocationLng     *float64             `json:"location_lng,omitempty"`
	LocationAddress string               `json:"location_address,omitempty"`
	EvidenceURLs    []string             `json:"evidence_urls,omitempty"`
	ActorID         string               `json:"actor_id"`
	ActorType       string               `json:"actor_type"`
	ProviderRef     string               `json:"provider_ref,omitempty"`
	ProviderAt      *time.Time           `json:"provider_accepted_at,omitempty"`
	CreatedAt       time.Time            `json:"created_at"`
	UpdatedAt       time.Time            `json:"updated_at"`
}

type RecordCarrierHandoffRequest struct {
	OrderID         string   `json:"order_id"`
	AWBNumber       string   `json:"awb_number"`
	LocationLat     *float64 `json:"location_lat,omitempty"`
	LocationLng     *float64 `json:"location_lng,omitempty"`
	LocationAddress string   `json:"location_address,omitempty"`
	EvidenceURLs    []string `json:"evidence_urls,omitempty"`
	ActorID         string   `json:"actor_id,omitempty"`
	ActorType       string   `json:"actor_type,omitempty"`
}

type CarrierAcceptanceEvent struct {
	Provider    string    `json:"provider"`
	AWBNumber   string    `json:"awb_number"`
	ProviderRef string    `json:"provider_ref,omitempty"`
	AcceptedAt  time.Time `json:"accepted_at"`
}

type CarrierHandoffRepository interface {
	GetAWBAttemptByOrder(ctx context.Context, orderID string) (*AWBAttempt, error)
	GetAWBAttemptByAWB(ctx context.Context, provider, awbNumber string) (*AWBAttempt, error)
	CreateAWBAttempt(ctx context.Context, attempt *AWBAttempt) (*AWBAttempt, error)
	MarkAWBCreated(ctx context.Context, attemptID, awbNumber, trackingURL string) error
	MarkAWBFailed(ctx context.Context, attemptID, message string) error
	CreateCarrierHandoff(ctx context.Context, handoff *CarrierHandoff) (*CarrierHandoff, error)
	MarkCarrierAccepted(ctx context.Context, attemptID, providerRef string, acceptedAt time.Time) error
}

type CarrierHandoffService interface {
	CreateAWB(ctx context.Context, orderID string, req AWBRequest) (*AWBAttempt, error)
	RecordHandoff(ctx context.Context, req RecordCarrierHandoffRequest) (*CarrierHandoff, error)
	ApplyCarrierAcceptance(ctx context.Context, event CarrierAcceptanceEvent) error
}
