package provider

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
)

// RuntimeStatusMapper contains provider-owned native code/status mappings.
// It is loaded from LOGISTICS_STATUS_MAPPINGS_JSON so carrier changes do not
// require a core rewrite. Values are restricted to canonical LANCAR states.
type RuntimeStatusMapper struct {
	mappings map[string]map[string]string
}

var canonicalCarrierStatuses = map[string]struct{}{
	"CREATED": {}, "AWB_ISSUED": {}, "PICKUP_SCHEDULED": {}, "PICKED_UP": {},
	"HANDED_TO_CARRIER": {}, "IN_TRANSIT": {}, "AT_SORTING_CENTER": {}, "OUT_FOR_DELIVERY": {},
	"DELIVERED": {}, "DELIVERY_FAILED": {}, "EXCEPTION": {}, "RETURN_REQUESTED": {},
	"RETURN_IN_TRANSIT": {}, "RETURNED_TO_SENDER": {}, "LOST": {}, "DAMAGED": {},
	"CANCELLED": {}, "UNKNOWN": {},
}

func LoadRuntimeStatusMapper(raw string) (RuntimeStatusMapper, error) {
	mapper := RuntimeStatusMapper{mappings: make(map[string]map[string]string)}
	if strings.TrimSpace(raw) == "" {
		return mapper, nil
	}
	var configured map[string]map[string]string
	if err := json.Unmarshal([]byte(raw), &configured); err != nil {
		return mapper, fmt.Errorf("decode logistics status mappings: %w", err)
	}
	for providerCode, entries := range configured {
		providerCode = strings.ToLower(strings.TrimSpace(providerCode))
		if providerCode == "" {
			return mapper, fmt.Errorf("status mapping provider cannot be empty")
		}
		mapper.mappings[providerCode] = make(map[string]string)
		for nativeValue, canonical := range entries {
			nativeValue = strings.ToUpper(strings.TrimSpace(nativeValue))
			canonical = strings.ToUpper(strings.TrimSpace(canonical))
			if nativeValue == "" {
				return mapper, fmt.Errorf("status mapping key cannot be empty for provider %s", providerCode)
			}
			if _, ok := canonicalCarrierStatuses[canonical]; !ok {
				return mapper, fmt.Errorf("invalid canonical status %q for provider %s", canonical, providerCode)
			}
			mapper.mappings[providerCode][nativeValue] = canonical
		}
	}
	return mapper, nil
}

func RuntimeStatusMapperFromEnv() (RuntimeStatusMapper, error) {
	return LoadRuntimeStatusMapper(os.Getenv("LOGISTICS_STATUS_MAPPINGS_JSON"))
}

func (m RuntimeStatusMapper) Normalize(provider, raw, code string) string {
	provider = strings.ToLower(strings.TrimSpace(provider))
	for _, nativeValue := range []string{code, raw} {
		if mapped, ok := m.mappings[provider][strings.ToUpper(strings.TrimSpace(nativeValue))]; ok {
			return mapped
		}
	}
	return normalizeCarrierStatusForProvider(provider, raw, code)
}
