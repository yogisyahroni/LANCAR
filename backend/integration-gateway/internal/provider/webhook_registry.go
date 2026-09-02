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
	mapper, err := RuntimeStatusMapperFromEnv()
	if err != nil {
		fmt.Printf("[integration-gateway] invalid runtime status mapping: %v\n", err)
		mapper = RuntimeStatusMapper{mappings: make(map[string]map[string]string)}
	}
	return &webhookAdapterRegistry{adapters: map[string]domain.WebhookAdapter{
		"jne": jneWebhookAdapter{mapper: mapper},
		"jnt": jntWebhookAdapter{mapper: mapper},
	}}
}

func (r *webhookAdapterRegistry) Get(provider string) (domain.WebhookAdapter, bool) {
	adapter, ok := r.adapters[strings.ToLower(strings.TrimSpace(provider))]
	return adapter, ok
}

type genericWebhookAdapter struct {
	code   string
	mapper RuntimeStatusMapper
}

func NewGenericWebhookAdapter(provider string) domain.WebhookAdapter {
	mapper, _ := RuntimeStatusMapperFromEnv()
	return genericWebhookAdapter{code: strings.ToLower(strings.TrimSpace(provider)), mapper: mapper}
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
		event.ProviderStatus = value
		event.Status = a.mapper.Normalize(a.code, value, "")
		event.CanonicalStatus = event.Status
	}
	if value, ok := payload["status_code"].(string); ok {
		event.RawCode = value
		event.ProviderCode = value
	}
	if value, ok := payload["description"].(string); ok {
		event.RawDescription = value
		event.ProviderDetail = value
	}
	if value, ok := payload["location"].(string); ok {
		event.RawLocation = value
		event.ProviderLocation = value
	}
	if value, ok := payload["occurred_at"].(string); ok {
		event.OccurredAt, event.ConfirmedAt = value, value
		event.ProviderTimestamp = value
	}
	if value, ok := payload["pod_url"].(string); ok {
		event.PodURL = value
	}
	if event.AWBNumber == "" {
		return event, fmt.Errorf("could not extract AWB number from %s webhook payload", a.code)
	}
	if event.RawStatus == "" {
		event.Status = "UNKNOWN"
		event.CanonicalStatus = "UNKNOWN"
	}
	event.RawStatus = firstNonEmpty(event.RawStatus, event.ProviderStatus, event.Status)
	event.ProviderStatus = firstNonEmpty(event.ProviderStatus, event.RawStatus)
	return event, nil
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}
