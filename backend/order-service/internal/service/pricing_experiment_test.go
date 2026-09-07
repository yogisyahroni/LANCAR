package service

import (
	"context"
	"encoding/json"
	"tembus/order-service/internal/domain"
	"testing"
	"time"
)

type pricingExperimentConfigStub struct{ value []byte }

func (s pricingExperimentConfigStub) GetConfig(context.Context, string) (*domain.SystemConfig, error) {
	return &domain.SystemConfig{Value: s.value}, nil
}
func (pricingExperimentConfigStub) GetFloatConfig(context.Context, string, float64) float64 { return 0 }
func (pricingExperimentConfigStub) GetIntConfig(context.Context, string, int) int           { return 0 }
func (pricingExperimentConfigStub) GetStringConfig(context.Context, string, string) string  { return "" }

func TestPricingExperimentAssignmentIsDeterministicForCustomerAndCourier(t *testing.T) {
	config := pricingExperimentConfig{
		ExperimentID:                "food-pricing-guardrail-v1",
		AssignmentSalt:              "salt",
		TrafficPercent:              100,
		ControlPricingRuleVersion:   "control-v1",
		TreatmentPricingRuleVersion: "treatment-v1",
		TreatmentMultiplier:         1.05,
	}
	window := time.Date(2026, time.September, 8, 10, 0, 0, 0, time.UTC)
	first := assignPricingExperiment(config, "customer", "customer-1", window)
	second := assignPricingExperiment(config, "customer", "customer-1", window)
	if first != second {
		t.Fatalf("same subject received different assignment: first=%+v second=%+v", first, second)
	}
	if first.Variant != "treatment" || first.PricingRuleVersion != "treatment-v1" || first.AssignmentKey == "" {
		t.Fatalf("treatment assignment incomplete: %+v", first)
	}
	courier := assignPricingExperiment(config, "courier", "courier-1", window)
	if courier.SubjectType != "courier" || courier.AssignmentKey == first.AssignmentKey {
		t.Fatalf("courier assignment must use its own deterministic cohort key: %+v", courier)
	}
}

func TestApplyPricingExperimentNeverExceedsResolvedProtectedCap(t *testing.T) {
	config := &pricingExperimentConfig{TreatmentMultiplier: 1.4}
	assignment := pricingExperimentAssignment{ExperimentID: "exp", SubjectType: "customer", AssignmentKey: "hash", Variant: "treatment", PricingRuleVersion: "treatment-v1"}
	decision := applyPricingExperiment(config, assignment, dynamicPricingDecision{
		Multiplier:       1.3,
		EffectiveCeiling: 1.4,
		TriggerContext:   map[string]string{"policy_version": "control-v1"},
	})
	if decision.Multiplier != 1.4 {
		t.Fatalf("multiplier=%v, want protected cap 1.4", decision.Multiplier)
	}
	if decision.TriggerContext["experiment_assignment_key"] != "hash" || decision.TriggerContext["experiment_variant"] != "treatment" {
		t.Fatalf("experiment metadata missing from trigger context: %+v", decision.TriggerContext)
	}
}

func TestLoadFoodPricingExperimentIgnoresDisabledConfig(t *testing.T) {
	raw, _ := json.Marshal(map[string]any{
		"experiment_id": "food-exp", "assignment_salt": "salt", "enabled": false, "killed": false,
		"control_pricing_rule_version": "control", "treatment_pricing_rule_version": "treatment", "treatment_multiplier": 1.05,
	})
	experiment, err := loadFoodPricingExperiment(context.Background(), pricingExperimentConfigStub{value: raw}, "default", time.Now())
	if err != nil || experiment != nil {
		t.Fatalf("disabled experiment should be ignored, got experiment=%+v err=%v", experiment, err)
	}
}

func TestLoadFoodPricingExperimentRejectsUnboundedActiveConfig(t *testing.T) {
	raw, _ := json.Marshal(map[string]any{
		"experiment_id": "food-exp", "assignment_salt": "salt", "enabled": true, "killed": false,
		"control_pricing_rule_version": "control", "treatment_pricing_rule_version": "treatment", "treatment_multiplier": 2,
	})
	_, err := loadFoodPricingExperiment(context.Background(), pricingExperimentConfigStub{value: raw}, "default", time.Now())
	if err == nil {
		t.Fatal("active unbounded experiment config was accepted")
	}
}
