package provider

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"tembus/integration-gateway/internal/domain"
)

// NormalizeTrackingResponse adapts a pull response to the same carrier event
// contract used by webhooks. The event identity is stable for a provider/AWB/
// status/timestamp tuple, so repeated polling is idempotent downstream.
func NormalizeTrackingResponse(provider string, response *domain.TrackingResponse) (domain.CarrierEvent, error) {
	if response == nil || strings.TrimSpace(response.AWBNumber) == "" {
		return domain.CarrierEvent{}, fmt.Errorf("tracking response must include an AWB number")
	}
	latest := ""
	if len(response.History) > 0 {
		latest = response.History[len(response.History)-1].Timestamp
	}
	status := normalizeCarrierStatusForProvider(provider, response.Status, "")
	payload, err := json.Marshal(response)
	if err != nil {
		return domain.CarrierEvent{}, fmt.Errorf("marshal tracking response: %w", err)
	}
	identity := sha256.Sum256([]byte(strings.ToLower(strings.TrimSpace(provider)) + ":" + response.AWBNumber + ":" + response.Status + ":" + latest))
	now := time.Now().UTC()
	occurredAt := latest
	if occurredAt == "" {
		occurredAt = now.Format(time.RFC3339)
	}
	location, detail := "", response.StatusDetail
	if len(response.History) > 0 {
		last := response.History[len(response.History)-1]
		location = last.Location
		if detail == "" {
			detail = last.Note
		}
	}
	return domain.CarrierEvent{
		EventID:           "poll:" + hex.EncodeToString(identity[:]),
		PayloadHash:       hex.EncodeToString(identity[:]),
		AWBNumber:         response.AWBNumber,
		Provider:          strings.ToLower(strings.TrimSpace(provider)),
		Status:            status,
		CanonicalStatus:   status,
		ProviderStatus:    response.Status,
		ProviderDetail:    detail,
		ProviderLocation:  location,
		ProviderTimestamp: occurredAt,
		RawStatus:         response.Status,
		OccurredAt:        occurredAt,
		RawPayload:        string(payload),
	}, nil
}

func normalizeCarrierStatus(raw string) string {
	return normalizeCarrierStatusForProvider("", raw, "")
}

// normalizeCarrierStatusForProvider keeps native code mapping at the provider
// boundary. Unknown values deliberately stay UNKNOWN; they must never be
// presented as an in-transit lifecycle transition by guesswork.
func normalizeCarrierStatusForProvider(provider, raw, code string) string {
	provider = strings.ToLower(strings.TrimSpace(provider))
	for _, value := range []string{code, raw} {
		if status := normalizeCarrierStatusValue(provider, value); status != "" {
			return status
		}
	}
	return "UNKNOWN"
}

func normalizeCarrierStatusValue(provider, raw string) string {
	raw = strings.ToUpper(strings.TrimSpace(raw))
	if raw == "" {
		return ""
	}
	// These native codes are only interpreted in the adapter that owns them.
	// A shared textual status can still be understood by every provider.
	if provider == "jnt" {
		switch raw {
		case "D01", "SIGNED":
			return "DELIVERED"
		}
	}
	if provider == "jne" {
		switch raw {
		case "D01":
			return "DELIVERED"
		}
	}
	switch strings.ToUpper(strings.TrimSpace(raw)) {
	case "DELIVERED", "PENANDATANGANAN":
		return "DELIVERED"
	case "PICKED_UP", "PICKUP", "PICKED UP":
		return "PICKED_UP"
	case "IN_TRANSIT", "TRANSIT", "ON_PROCESS", "ON PROCESS":
		return "IN_TRANSIT"
	case "MANIFESTED", "MANIFEST", "AWB_ISSUED":
		return "AWB_ISSUED"
	case "AT_SORTING_CENTER", "SORTING", "SORTED":
		return "AT_SORTING_CENTER"
	case "OUT_FOR_DELIVERY", "DELIVERY":
		return "OUT_FOR_DELIVERY"
	case "DELIVERY_FAILED", "FAILED_DELIVERY", "FAILED":
		return "DELIVERY_FAILED"
	case "EXCEPTION", "PROBLEM":
		return "EXCEPTION"
	case "RETURN_TO_SENDER", "RETURN_IN_TRANSIT":
		return "RETURN_IN_TRANSIT"
	case "RETURNED", "RETURNED_TO_SENDER":
		return "RETURNED_TO_SENDER"
	case "CANCELLED", "CANCELED":
		return "CANCELLED"
	default:
		return ""
	}
}
