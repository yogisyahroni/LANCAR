package provider

import "strings"

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
