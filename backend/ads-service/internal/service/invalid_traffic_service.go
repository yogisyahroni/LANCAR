package service

import "tembus/ads-service/internal/domain"

type InvalidTrafficDecision struct {
	Excluded bool   `json:"excluded"`
	Reason   string `json:"reason"`
	ReviewID string `json:"review_id,omitempty"`
}

// Keep signals privacy-minimized: only server-issued hashes and bounded cadence
// are consumed; raw device fingerprints and user lists never enter Merchant UI.
func EvaluateInvalidTraffic(event domain.AdEvent, clicksInWindow int, selfClick bool) InvalidTrafficDecision {
	if selfClick {
		return InvalidTrafficDecision{Excluded: true, Reason: "merchant_self_interaction"}
	}
	if event.EventType == domain.EventClick && clicksInWindow > 20 {
		return InvalidTrafficDecision{Excluded: true, Reason: "impossible_click_cadence"}
	}
	return InvalidTrafficDecision{Excluded: false, Reason: "not_flagged"}
}
