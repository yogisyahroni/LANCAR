package service

import (
	"strings"
	"time"

	"tembus/ads-service/internal/domain"
)

type EligibilityInput struct {
	Now              time.Time
	Audience         domain.AudienceContext
	MerchantActive   bool
	MerchantOpen     bool
	Serviceable      bool
	Relevant         bool
	CatalogAvailable bool
	RiskApproved     bool
	AppVersion       string
}

type EligibilityService struct{}

func (EligibilityService) Check(candidate domain.Campaign, input EligibilityInput) (bool, string) {
	if !candidate.ServesAt(input.Now) {
		return false, "campaign_not_active_or_expired"
	}
	if !input.MerchantActive {
		return false, "merchant_inactive"
	}
	if !input.MerchantOpen {
		return false, "merchant_closed"
	}
	if !input.Serviceable {
		return false, "out_of_service_area"
	}
	if !input.Relevant {
		return false, "irrelevant_context"
	}
	if !input.CatalogAvailable {
		return false, "catalog_unavailable"
	}
	if !input.RiskApproved {
		return false, "risk_suspended"
	}
	if !candidate.Audience.Matches(input.Audience) {
		return false, "audience_mismatch"
	}
	return true, "eligible"
}

func NormalizeIntent(intent string) string { return strings.ToLower(strings.TrimSpace(intent)) }
