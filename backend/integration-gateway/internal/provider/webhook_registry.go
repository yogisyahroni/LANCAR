package provider

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"tembus/integration-gateway/internal/domain"
)

type webhookAdapterRegistry struct {
	adapters map[string]domain.WebhookAdapter
}

func NewWebhookAdapterRegistry() domain.WebhookAdapterRegistry {
	return &webhookAdapterRegistry{adapters: map[string]domain.WebhookAdapter{
		"jne": jneWebhookAdapter{},
		"jnt": jntWebhookAdapter{},
	}}
}

func (r *webhookAdapterRegistry) Get(provider string) (domain.WebhookAdapter, bool) {
	adapter, ok := r.adapters[strings.ToLower(strings.TrimSpace(provider))]
	return adapter, ok
}

type genericWebhookAdapter struct{ code string }

func NewGenericWebhookAdapter(provider string) domain.WebhookAdapter {
	return genericWebhookAdapter{code: strings.ToLower(strings.TrimSpace(provider))}
}

func (a genericWebhookAdapter) ProviderCode() string { return a.code }
func (a genericWebhookAdapter) VerifySignature(headers http.Header, body []byte, secret string) error {
	return verifyHMACSignature(headers, body, secret)
}
func (a genericWebhookAdapter) Normalize(body []byte) (domain.CarrierEvent, error) {
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		return domain.CarrierEvent{}, err
	}
	event := domain.CarrierEvent{Provider: strings.ToUpper(a.code)}
	if value, ok := payload["awb_number"].(string); ok {
		event.AWBNumber = value
	} else if value, ok := payload["awb"].(string); ok {
		event.AWBNumber = value
	}
	if value, ok := payload["status"].(string); ok {
		event.RawStatus = value
		event.Status = normalizeCarrierStatus(value)
	}
	if value, ok := payload["status_code"].(string); ok {
		event.RawCode = value
	}
	if value, ok := payload["description"].(string); ok {
		event.RawDescription = value
	}
	if value, ok := payload["location"].(string); ok {
		event.RawLocation = value
	}
	if value, ok := payload["occurred_at"].(string); ok {
		event.OccurredAt, event.ConfirmedAt = value, value
	}
	if value, ok := payload["pod_url"].(string); ok {
		event.PodURL = value
	}
	if event.AWBNumber == "" {
		return event, fmt.Errorf("could not extract AWB number from %s webhook payload", a.code)
	}
	if event.RawStatus == "" {
		event.Status = "UNKNOWN"
	}
	return event, nil
}
