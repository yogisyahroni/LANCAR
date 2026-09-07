package service

import (
	"context"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math"
	"strings"
	"tembus/order-service/internal/domain"
	"time"
)

const foodPricingExperimentConfigKey = "marketplace_pricing_experiment_food_delivery"

type freshConfigReader interface {
	GetConfigFresh(ctx context.Context, key string) (*domain.SystemConfig, error)
}

// pricingExperimentConfig is deliberately stored in system_configs so the
// existing admin control plane remains the single runtime configuration
// source. The default migration is disabled; an enabled experiment must be
// fully specified and bounded before order-service will use it.
type pricingExperimentConfig struct {
	ExperimentID                string  `json:"experiment_id"`
	ServiceCode                 string  `json:"service_code"`
	Market                      string  `json:"market"`
	Enabled                     bool    `json:"enabled"`
	Killed                      bool    `json:"killed"`
	AssignmentSalt              string  `json:"assignment_salt"`
	TrafficPercent              float64 `json:"traffic_percent"`
	ControlPricingRuleVersion   string  `json:"control_pricing_rule_version"`
	TreatmentPricingRuleVersion string  `json:"treatment_pricing_rule_version"`
	TreatmentMultiplier         float64 `json:"treatment_multiplier"`
	StartsAt                    string  `json:"starts_at,omitempty"`
	EndsAt                      string  `json:"ends_at,omitempty"`
	KillReason                  string  `json:"kill_reason,omitempty"`
}

type pricingExperimentAssignment struct {
	ExperimentID         string
	SubjectType          string
	AssignmentKey        string
	Variant              string
	PricingRuleVersion   string
	QuoteWindowExpiresAt time.Time
}

func (c pricingExperimentConfig) validate(serviceCode, market string, now time.Time) error {
	if strings.TrimSpace(c.ExperimentID) == "" || strings.TrimSpace(c.AssignmentSalt) == "" {
		return fmt.Errorf("pricing experiment metadata is incomplete")
	}
	if c.ServiceCode != "" && c.ServiceCode != serviceCode {
		return fmt.Errorf("pricing experiment service_code %q does not match %q", c.ServiceCode, serviceCode)
	}
	if c.Market != "" && normalizePricingMarket(c.Market) != normalizePricingMarket(market) {
		return fmt.Errorf("pricing experiment market %q does not match %q", c.Market, market)
	}
	if !math.IsNaN(c.TrafficPercent) && (c.TrafficPercent < 0 || c.TrafficPercent > 100) {
		return fmt.Errorf("pricing experiment traffic_percent must be between 0 and 100")
	}
	if c.TreatmentMultiplier == 0 {
		c.TreatmentMultiplier = 1
	}
	// Food pricing is protected by the same hard cap as the base policy. This
	// bound is checked again against the resolved policy in applyPricingExperiment.
	if c.TreatmentMultiplier < 1 || c.TreatmentMultiplier > 1.4 {
		return fmt.Errorf("pricing experiment treatment_multiplier must be between 1 and 1.4")
	}
	if c.ControlPricingRuleVersion == "" || c.TreatmentPricingRuleVersion == "" {
		return fmt.Errorf("pricing experiment rule versions are required")
	}
	for field, raw := range map[string]string{"starts_at": c.StartsAt, "ends_at": c.EndsAt} {
		if strings.TrimSpace(raw) == "" {
			continue
		}
		if _, err := time.Parse(time.RFC3339, raw); err != nil {
			return fmt.Errorf("pricing experiment %s is not RFC3339: %w", field, err)
		}
	}
	if c.StartsAt != "" && c.EndsAt != "" {
		start, _ := time.Parse(time.RFC3339, c.StartsAt)
		end, _ := time.Parse(time.RFC3339, c.EndsAt)
		if !end.After(start) {
			return fmt.Errorf("pricing experiment ends_at must be after starts_at")
		}
	}
	return nil
}

func loadFoodPricingExperiment(ctx context.Context, repo domain.ConfigRepository, market string, now time.Time) (*pricingExperimentConfig, error) {
	if repo == nil {
		return nil, nil
	}
	var config *domain.SystemConfig
	var err error
	if fresh, ok := repo.(freshConfigReader); ok {
		config, err = fresh.GetConfigFresh(ctx, foodPricingExperimentConfigKey)
	} else {
		config, err = repo.GetConfig(ctx, foodPricingExperimentConfigKey)
	}
	if err != nil {
		return nil, fmt.Errorf("load pricing experiment: %w", err)
	}
	if config == nil || len(config.Value) == 0 {
		return nil, nil
	}
	var experiment pricingExperimentConfig
	if err := json.Unmarshal(config.Value, &experiment); err != nil {
		return nil, fmt.Errorf("decode pricing experiment: %w", err)
	}
	if !experiment.Enabled || experiment.Killed {
		return nil, nil
	}
	if err := experiment.validate("food_delivery", market, now); err != nil {
		return nil, err
	}
	if experiment.StartsAt != "" {
		start, _ := time.Parse(time.RFC3339, experiment.StartsAt)
		if now.Before(start) {
			return nil, nil
		}
	}
	if experiment.EndsAt != "" {
		end, _ := time.Parse(time.RFC3339, experiment.EndsAt)
		if !now.Before(end) {
			return nil, nil
		}
	}
	return &experiment, nil
}

// assignPricingExperiment is shared by customer quote assignment and courier
// dispatch metadata. It never uses random state: the same subject receives
// the same variant for the same experiment salt.
func assignPricingExperiment(config pricingExperimentConfig, subjectType, subjectID string, quoteWindowExpiresAt time.Time) pricingExperimentAssignment {
	subjectType = strings.ToLower(strings.TrimSpace(subjectType))
	subjectID = strings.TrimSpace(subjectID)
	payload := config.ExperimentID + "\x00" + subjectType + "\x00" + subjectID + "\x00" + config.AssignmentSalt
	digest := sha256.Sum256([]byte(payload))
	assignmentKey := hex.EncodeToString(digest[:])
	bucket := float64(binary.BigEndian.Uint32(digest[:4])%10000) / 100
	variant := "control"
	ruleVersion := config.ControlPricingRuleVersion
	if bucket < config.TrafficPercent {
		variant = "treatment"
		ruleVersion = config.TreatmentPricingRuleVersion
	}
	return pricingExperimentAssignment{
		ExperimentID:         config.ExperimentID,
		SubjectType:          subjectType,
		AssignmentKey:        assignmentKey,
		Variant:              variant,
		PricingRuleVersion:   ruleVersion,
		QuoteWindowExpiresAt: quoteWindowExpiresAt,
	}
}

func applyPricingExperiment(config *pricingExperimentConfig, assignment pricingExperimentAssignment, decision dynamicPricingDecision) dynamicPricingDecision {
	if config == nil {
		return decision
	}
	if decision.TriggerContext == nil {
		decision.TriggerContext = make(map[string]string)
	} else {
		copied := make(map[string]string, len(decision.TriggerContext)+6)
		for key, value := range decision.TriggerContext {
			copied[key] = value
		}
		decision.TriggerContext = copied
	}
	decision.TriggerContext["experiment_id"] = assignment.ExperimentID
	decision.TriggerContext["experiment_variant"] = assignment.Variant
	decision.TriggerContext["experiment_assignment_key"] = assignment.AssignmentKey
	decision.TriggerContext["experiment_pricing_rule_version"] = assignment.PricingRuleVersion
	decision.TriggerContext["experiment_subject_type"] = assignment.SubjectType
	if assignment.Variant == "treatment" {
		multiplier := config.TreatmentMultiplier
		if multiplier == 0 {
			multiplier = 1
		}
		decision.Multiplier *= multiplier
		if decision.Multiplier < 1 {
			decision.Multiplier = 1
		}
		if decision.EffectiveCeiling > 0 && decision.Multiplier > decision.EffectiveCeiling {
			decision.Multiplier = decision.EffectiveCeiling
		}
		decision.TriggerContext["experiment_treatment_multiplier"] = fmt.Sprintf("%.4f", multiplier)
	}
	decision.TriggerContext["effective_multiplier"] = fmt.Sprintf("%.4f", decision.Multiplier)
	return decision
}
