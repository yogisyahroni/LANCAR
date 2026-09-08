package service

import "testing"

func TestAnalyticsMetricDefinitionsAreGovernedAndComplete(t *testing.T) {
	if err := ValidateAnalyticsMetricDefinitions(); err != nil {
		t.Fatalf("expected valid analytics metric definitions, got %v", err)
	}

	required := map[string]bool{
		"gmv":               false,
		"completed_order":   false,
		"cancellation_rate": false,
		"refund_rate":       false,
		"active_courier":    false,
		"active_merchant":   false,
		"sla_compliance":    false,
	}
	for _, definition := range AnalyticsMetricDefinitions {
		if _, ok := required[definition.Name]; ok {
			required[definition.Name] = true
		}
	}
	for name, present := range required {
		if !present {
			t.Errorf("missing governed metric definition %q", name)
		}
	}
}
