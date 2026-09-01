package domain

import (
	"net/http"
)

// CarrierEvent is the provider-neutral event forwarded to order-service.
// Raw provider fields are retained alongside the canonical status.
type CarrierEvent struct {
	EventID        string `json:"event_id"`
	PayloadHash    string `json:"payload_hash"`
	AWBNumber      string `json:"awb_number"`
	Provider       string `json:"provider"`
	Status         string `json:"status"`
	RawStatus      string `json:"raw_status"`
	RawCode        string `json:"raw_code,omitempty"`
	RawDescription string `json:"raw_description,omitempty"`
	RawLocation    string `json:"raw_location,omitempty"`
	PodURL         string `json:"pod_url,omitempty"`
	OccurredAt     string `json:"occurred_at,omitempty"`
	ConfirmedAt    string `json:"confirmed_at,omitempty"`
	RawPayload     string `json:"raw_payload,omitempty"`
}

// WebhookAdapter owns provider-specific authentication and payload parsing.
type WebhookAdapter interface {
	ProviderCode() string
	VerifySignature(headers http.Header, body []byte, secret string) error
	Normalize(body []byte) (CarrierEvent, error)
}

type WebhookAdapterRegistry interface {
	Get(provider string) (WebhookAdapter, bool)
}
