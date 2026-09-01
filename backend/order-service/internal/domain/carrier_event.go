package domain

import (
	"context"
	"time"
)

type CarrierEvent struct {
	ID                string     `json:"id"`
	Provider          string     `json:"provider"`
	EventID           string     `json:"event_id"`
	PayloadHash       string     `json:"payload_hash"`
	AWBNumber         string     `json:"awb_number"`
	CanonicalStatus   string     `json:"canonical_status"`
	ProviderStatus    string     `json:"provider_status,omitempty"`
	ProviderCode      string     `json:"provider_status_code,omitempty"`
	ProviderDetail    string     `json:"provider_status_description,omitempty"`
	ProviderLocation  string     `json:"provider_location,omitempty"`
	ProviderTimestamp string     `json:"provider_timestamp,omitempty"`
	RawStatus         string     `json:"raw_status"`
	RawCode           string     `json:"raw_code,omitempty"`
	RawDescription    string     `json:"raw_description,omitempty"`
	RawLocation       string     `json:"raw_location,omitempty"`
	OccurredAt        *time.Time `json:"occurred_at,omitempty"`
	ReceivedAt        time.Time  `json:"received_at"`
	RawPayload        string     `json:"raw_payload,omitempty"`
}

type CarrierEventRepository interface {
	InsertIfNew(ctx context.Context, event *CarrierEvent) (bool, error)
}

type CarrierEventService interface {
	Process(ctx context.Context, event *CarrierEvent) error
}
