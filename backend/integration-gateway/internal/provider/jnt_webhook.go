package provider

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"tembus/integration-gateway/internal/domain"
)

type jntWebhookAdapter struct{}

type jntWebhookPayload struct {
	WaybillNo string `json:"billcode"`
	ScanType  string `json:"scantype"`
	PhotoURL  string `json:"signpic"`
	ScanTime  string `json:"scantime"`
	ScanCode  string `json:"scanCode"`
	Location  string `json:"scanNetwork"`
}

func (jntWebhookAdapter) ProviderCode() string { return "jnt" }

func (jntWebhookAdapter) VerifySignature(headers http.Header, body []byte, secret string) error {
	return verifyHMACSignature(headers, body, secret)
}

func (a jntWebhookAdapter) Normalize(body []byte) (domain.CarrierEvent, error) {
	var payload jntWebhookPayload
	if err := json.Unmarshal(body, &payload); err != nil {
		return domain.CarrierEvent{}, err
	}
	if strings.TrimSpace(payload.WaybillNo) == "" {
		return domain.CarrierEvent{}, fmt.Errorf("could not extract AWB number from %s webhook payload", a.ProviderCode())
	}
	return domain.CarrierEvent{
		Provider:       "JNT",
		AWBNumber:      payload.WaybillNo,
		Status:         normalizeCarrierStatus(payload.ScanType),
		RawStatus:      payload.ScanType,
		RawCode:        payload.ScanCode,
		RawDescription: payload.ScanType,
		RawLocation:    payload.Location,
		PodURL:         payload.PhotoURL,
		OccurredAt:     payload.ScanTime,
		ConfirmedAt:    payload.ScanTime,
	}, nil
}
