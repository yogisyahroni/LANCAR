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
	value      []byte
	killSwitch bool
}

func (s dynamicPricingConfigStub) GetConfig(context.Context, string) (*domain.SystemConfig, error) {
	return &domain.SystemConfig{Value: s.value}, nil
}
func (dynamicPricingConfigStub) GetFloatConfig(context.Context, string, float64) float64 { return 0 }
func (dynamicPricingConfigStub) GetIntConfig(context.Context, string, int) int           { return 0 }
func (s dynamicPricingConfigStub) GetStringConfig(_ context.Context, key string, fallback string) string {
	if key == "marketplace_pricing_kill_switch" && s.killSwitch {
		return "true"
	}
	return fallback
}

type dynamicPricingRedisStub struct{ multiplier float64 }

func (dynamicPricingRedisStub) SaveEstimate(context.Context, *domain.PricingEstimateResponse) error {
	return nil
}
func (dynamicPricingRedisStub) GetEstimate(context.Context, string) (*domain.PricingEstimateResponse, error) {
	return nil, nil
}
func (dynamicPricingRedisStub) GetConfig(context.Context) (*domain.PricingConfig, error) {
	return nil, nil
}
func (dynamicPricingRedisStub) UpdateConfig(context.Context, *domain.PricingConfig) error { return nil }
func (s dynamicPricingRedisStub) GetMultiplier(context.Context, string) (float64, error) {
	return s.multiplier, nil
}
func (dynamicPricingRedisStub) UpdateCourierLocation(context.Context, string, float64, float64) error {
	return nil
}
func (dynamicPricingRedisStub) FindNearbyCouriers(context.Context, float64, float64, float64) ([]string, error) {
	return nil, nil
}
func (dynamicPricingRedisStub) AcquireLock(context.Context, string, time.Duration) (bool, error) {
	return true, nil
}
func (dynamicPricingRedisStub) ReleaseLock(context.Context, string) error { return nil }

type dynamicPricingPricingStub struct{ domain.PricingRepository }

func (dynamicPricingPricingStub) ResolveZoneCode(context.Context, float64, float64) (string, error) {
	return "JKT-PST", nil
}

func TestEvaluateDynamicPricingKillSwitchReturnsBaseMultiplier(t *testing.T) {
	configured := dynamicPricingPolicy{
		PolicyVersion: "market-v3", Market: "default", ServiceCode: "food_delivery", ZoneScope: "active_zone",
		Timezone: "Asia/Jakarta", FloorMultiplier: 1, CeilingMultiplier: 1.4, ProtectedCapMultiplier: 1.4,
		PeakMultiplier: 1.1, FairnessReviewed: true,
	}
	payload, err := json.Marshal(configured)
	if err != nil {
		t.Fatal(err)
	}
	policy, decision, err := evaluateDynamicPricing(
		context.Background(),
		dynamicPricingRedisStub{multiplier: 1.35},
		dynamicPricingPricingStub{},
		dynamicPricingConfigStub{value: payload, killSwitch: true},
		"food_delivery", "default", -6.2, 106.8,
	)
	if err != nil {
		t.Fatal(err)
	}
	if policy.PolicyVersion != "market-v3" || decision.Multiplier != 1 || decision.PeakApplied || decision.TriggerContext["rollback_kill_switch"] != "true" {
		t.Fatalf("kill switch decision = %+v", decision)
	}
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
