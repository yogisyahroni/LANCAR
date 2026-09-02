package domain

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"strings"
)

// QuoteInputFingerprint identifies the inputs that pricing is allowed to use.
// JSON encoding a typed request keeps the fingerprint deterministic while
// avoiding client-controlled totals or generated quote metadata.
func QuoteInputFingerprint(req PricingEstimateRequest) string {
	payload, _ := json.Marshal(req)
	sum := sha256.Sum256(payload)
	return hex.EncodeToString(sum[:])
}

// QuoteSnapshotHash covers the server-produced quote snapshot. Generated
// identity and expiry are intentionally included so support can prove which
// exact quote was consumed by an order.
func QuoteSnapshotHash(quote PricingEstimateResponse) string {
	quote.SnapshotHash = ""
	payload, _ := json.Marshal(quote)
	sum := sha256.Sum256(payload)
	return hex.EncodeToString(sum[:])
}

func CanonicalServiceCategoryForModel(model string) string {
	switch strings.ToLower(strings.TrimSpace(model)) {
	case "food", "food_delivery":
		return "food"
	case "tambal_ban", "tambalban":
		return "tambal_ban"
	case "towing":
		return "towing"
	case "aggregator", "jne", "jnt", "sicepat", "anteraja":
		return "aggregator"
	case "p2p", "two_legs", "three_legs", "hub_and_spoke", "model_p2p", "package_on_demand", "on_demand", "regular", "network":
		return "package_on_demand"
	default:
		return "unknown"
	}
}
