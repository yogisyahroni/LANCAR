package experiment

import "testing"

func testExperiment() Experiment {
	return Experiment{
		ID: "00000000-0000-0000-0000-000000000008", Key: "food-home-layout-v1", Name: "Food home layout",
		Namespace: "food-home", Status: StatusRunning, Version: 1,
		Targeting:  Targeting{MarketCodes: []string{"id-jk"}, CityCodes: []string{"jakarta"}, ServiceCodes: []string{"food_delivery"}},
		Variants:   []Variant{{Key: "control", Weight: 5000, Payload: map[string]interface{}{}}, {Key: "treatment", Weight: 5000, Payload: map[string]interface{}{"layout": "dense_cards"}}},
		Guardrails: DefaultGuardrails(),
	}
}

func TestResolveIsDeterministicAndTargeted(t *testing.T) {
	exp := testExperiment()
	ctx := EvaluationContext{MarketCode: "id-jk", CityCode: "Jakarta", ServiceCode: "food_delivery"}
	first, reason, err := Resolve(exp, "customer", "customer-1", ctx, []byte("a-server-secret-that-is-long-enough"))
	if err != nil || reason != "assigned" || first == nil {
		t.Fatalf("first resolve = %#v, %q, %v", first, reason, err)
	}
	second, _, err := Resolve(exp, "customer", "customer-1", ctx, []byte("a-server-secret-that-is-long-enough"))
	if err != nil || second == nil || first.AssignmentKey != second.AssignmentKey || first.Variant != second.Variant || first.Bucket != second.Bucket {
		t.Fatalf("assignment is not stable: first=%#v second=%#v err=%v", first, second, err)
	}
	outside, reason, err := Resolve(exp, "customer", "customer-1", EvaluationContext{MarketCode: "id-bali", CityCode: "Jakarta", ServiceCode: "food_delivery"}, []byte("a-server-secret-that-is-long-enough"))
	if err != nil || outside != nil || reason != "outside_targeting" {
		t.Fatalf("outside targeting = %#v, %q, %v", outside, reason, err)
	}
}

func TestResolveSupportsSafeAttributesAndVersionRange(t *testing.T) {
	exp := testExperiment()
	exp.Targeting = Targeting{
		AppVersionMin: "2.10.0", AppVersionMax: "2.12.0",
		SafeAttributes: map[string][]string{"platform": {"android"}, "velocity_band": {"low"}},
	}
	ctx := EvaluationContext{AppVersion: "2.11.3", SafeAttributes: map[string]string{"platform": "android", "velocity_band": "low"}}
	assignment, _, err := Resolve(exp, "customer", "customer-2", ctx, []byte("another-server-secret"))
	if err != nil || assignment == nil {
		t.Fatalf("safe attribute assignment failed: %#v, %v", assignment, err)
	}
	ctx.AppVersion = "2.13.0"
	assignment, reason, err := Resolve(exp, "customer", "customer-2", ctx, []byte("another-server-secret"))
	if err != nil || assignment != nil || reason != "outside_targeting" {
		t.Fatalf("version targeting mismatch: %#v, %q, %v", assignment, reason, err)
	}
}

func TestValidateExperimentRejectsSensitiveOrFinancialTreatmentConfig(t *testing.T) {
	exp := testExperiment()
	exp.Targeting.SafeAttributes = map[string][]string{"health_status": {"ok"}}
	if err := ValidateExperiment(exp); err == nil {
		t.Fatal("expected sensitive targeting attribute to be rejected")
	}
	exp = testExperiment()
	exp.Targeting = Targeting{}
	exp.Variants[1].Payload = map[string]interface{}{"price_override": 1000}
	if err := ValidateExperiment(exp); err == nil {
		t.Fatal("expected financial treatment field to be rejected")
	}
}

func TestKilledExperimentDoesNotAssign(t *testing.T) {
	exp := testExperiment()
	exp.Status = StatusKilled
	assignment, reason, err := Resolve(exp, "customer", "customer-3", EvaluationContext{}, []byte("server-secret"))
	if err != nil || assignment != nil || reason != "disabled" {
		t.Fatalf("killed experiment = %#v, %q, %v", assignment, reason, err)
	}
}

func TestDefaultGuardrailsCoverMarketplaceSafetyMetrics(t *testing.T) {
	seen := make(map[string]bool)
	for _, guardrail := range DefaultGuardrails() {
		seen[guardrail.Metric] = true
	}
	for _, metric := range []string{"crash_error_rate", "cancellation_rate", "refund_rate", "eta_sla", "support_contact_rate"} {
		if !seen[metric] {
			t.Fatalf("missing required guardrail metric %q", metric)
		}
	}
}
