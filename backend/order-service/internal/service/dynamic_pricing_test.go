package service

import (
	"context"
	"encoding/json"
	"tembus/order-service/internal/domain"
	"testing"
	"time"
)

func TestDynamicPricingPolicyClampsOrdinaryMultiplierToProtectedCap(t *testing.T) {
	policy := dynamicPricingPolicy{
		PolicyVersion:          "test-v2",
		Market:                 "default",
		ServiceCode:            "food_delivery",
		ZoneScope:              "active_zone",
		Timezone:               "Asia/Jakarta",
		FloorMultiplier:        1,
		CeilingMultiplier:      2,
		ProtectedCapMultiplier: 1.4,
		PeakMultiplier:         1.1,
		PeakWindows:            []pricingPeakWindow{{StartHour: 11, EndHour: 14}},
		FairnessReviewed:       true,
	}
	local, err := time.LoadLocation("Asia/Jakarta")
	if err != nil {
		t.Fatal(err)
	}
	decision, err := policy.Evaluate(2, "JKT-PST", time.Date(2026, 9, 7, 12, 0, 0, 0, local))
	if err != nil {
		t.Fatal(err)
	}
	if decision.Multiplier != 1.4 || !decision.PeakApplied {
		t.Fatalf("decision = %+v, want capped peak decision", decision)
	}
	if decision.TriggerContext["zone"] != "JKT-PST" || decision.TriggerContext["protected_cap"] != "1.4000" {
		t.Fatalf("trigger context missing scope/cap: %+v", decision.TriggerContext)
	}
}

type dynamicPricingConfigStub struct {
	value []byte
}

func (s dynamicPricingConfigStub) GetConfig(context.Context, string) (*domain.SystemConfig, error) {
	return &domain.SystemConfig{Value: s.value}, nil
}
func (dynamicPricingConfigStub) GetFloatConfig(context.Context, string, float64) float64 { return 0 }
func (dynamicPricingConfigStub) GetIntConfig(context.Context, string, int) int           { return 0 }
func (dynamicPricingConfigStub) GetStringConfig(_ context.Context, _ string, fallback string) string {
	return fallback
}

func TestResolveDynamicPricingPolicyUsesConfiguredServiceAndMarketScope(t *testing.T) {
	configured := dynamicPricingPolicy{
		PolicyVersion:          "market-v3",
		Market:                 "id-jakarta",
		ServiceCode:            "tambal_ban_motor",
		ZoneScope:              "active_zone",
		Timezone:               "Asia/Jakarta",
		FloorMultiplier:        1,
		CeilingMultiplier:      1.2,
		ProtectedCapMultiplier: 1.2,
		PeakMultiplier:         1,
		FairnessReviewed:       true,
	}
	payload, err := json.Marshal(configured)
	if err != nil {
		t.Fatal(err)
	}
	policy, err := resolveDynamicPricingPolicy(context.Background(), dynamicPricingConfigStub{value: payload}, "tambal_ban_motor", "id-jakarta")
	if err != nil {
		t.Fatal(err)
	}
	if policy.PolicyVersion != "market-v3" || policy.ServiceCode != "tambal_ban_motor" || policy.Market != "id-jakarta" || policy.CeilingMultiplier != 1.2 {
		t.Fatalf("configured policy was not preserved: %+v", policy)
	}
}
