package provider

import "strings"

func normalizeCarrierStatus(raw string) string {
	switch strings.ToUpper(strings.TrimSpace(raw)) {
	case "DELIVERED", "D01", "SIGNED", "PENANDATANGANAN":
		return "DELIVERED"
	case "PICKED_UP", "PICKUP", "PICKED UP":
		return "PICKED_UP"
	case "IN_TRANSIT", "TRANSIT", "ON_PROCESS":
		return "IN_TRANSIT"
	case "MANIFESTED", "MANIFEST":
		return "MANIFESTED"
	case "RETURN_TO_SENDER", "RETURNED":
		return "RETURN_TO_SENDER"
	case "CANCELLED", "CANCELED":
		return "CANCELLED"
	default:
		return "UNKNOWN"
	}
}
