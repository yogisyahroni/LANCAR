package provider

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"tembus/integration-gateway/internal/domain"
)

type jneWebhookAdapter struct{}

type jneWebhookPayload struct {
	AWB      string `json:"cnote_no"`
	Status   string `json:"status"`
	Date     string `json:"delivery_date"`
	PODImage string `json:"pod_photo_url"`
	Code     string `json:"status_code"`
	Location string `json:"location"`
}

func (jneWebhookAdapter) ProviderCode() string { return "jne" }

func (jneWebhookAdapter) VerifySignature(headers http.Header, body []byte, secret string) error {
	return verifyHMACSignature(headers, body, secret)
}

func (a jneWebhookAdapter) Normalize(body []byte) (domain.CarrierEvent, error) {
	var payload jneWebhookPayload
	if err := json.Unmarshal(body, &payload); err != nil {
		return domain.CarrierEvent{}, err
	}
	if strings.TrimSpace(payload.AWB) == "" {
		return domain.CarrierEvent{}, fmt.Errorf("could not extract AWB number from %s webhook payload", a.ProviderCode())
	}
	return domain.CarrierEvent{
		Provider:       "JNE",
		AWBNumber:      payload.AWB,
		Status:         normalizeCarrierStatus(payload.Status),
		RawStatus:      payload.Status,
		RawCode:        payload.Code,
		RawDescription: payload.Status,
		RawLocation:    payload.Location,
		PodURL:         payload.PODImage,
		OccurredAt:     payload.Date,
		ConfirmedAt:    payload.Date,
	}, nil
}
