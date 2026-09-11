package domain

import (
	"errors"
	"strings"
)

// ExperimentExposure is intentionally separate from AdEvent. An exposure is
// evidence that an assigned treatment was seen/used; it is never a billable
// billable impression and carries only an opaque assignment key.
type ExperimentExposure struct {
	ExperimentKey string `json:"experiment_key"`
	AssignmentKey string `json:"assignment_key"`
	VariantKey    string `json:"variant_key"`
	Placement     string `json:"placement"`
	CampaignID    string `json:"campaign_id,omitempty"`
}

func (e ExperimentExposure) Validate() error {
	if strings.TrimSpace(e.ExperimentKey) == "" || len(e.ExperimentKey) > 120 {
		return errors.New("experiment key is invalid")
	}
	if len(strings.TrimSpace(e.AssignmentKey)) != 43 {
		return errors.New("assignment key must be an opaque 43-character hash")
	}
	if strings.TrimSpace(e.VariantKey) == "" || len(e.VariantKey) > 120 {
		return errors.New("variant key is invalid")
	}
	if !IsKnownPlacement(e.Placement) || IsProtectedAdFree(e.Placement) {
		return errors.New("experiment placement is not eligible")
	}
	return nil
}

func IsKnownPlacement(raw string) bool {
	_, ok := DefaultPlacementPolicies()[Placement(strings.TrimSpace(raw))]
	return ok
}
