package service

import (
	"context"
	"encoding/json"
	"tembus/order-service/internal/domain"
	"testing"
	"time"
)

type experimentFoodRepoStub struct {
	domain.FoodRepository
	merchant domain.FoodMerchantInfo
	item     domain.FoodMenuItemInfo
}

func (r experimentFoodRepoStub) GetFoodMerchant(context.Context, string) (*domain.FoodMerchantInfo, error) {
	return &r.merchant, nil
}
func (r experimentFoodRepoStub) GetFoodMenuItems(context.Context, []string) ([]domain.FoodMenuItemInfo, error) {
	return []domain.FoodMenuItemInfo{r.item}, nil
}
func (r experimentFoodRepoStub) GetMenuItemVariants(context.Context, []string) (map[string][]domain.MenuItemVariant, error) {
	return map[string][]domain.MenuItemVariant{}, nil
}

type experimentPricingRepoStub struct{ domain.PricingRepository }

func (experimentPricingRepoStub) GetDeliveryServiceByCode(context.Context, string) (*domain.DeliveryServiceProduct, error) {
	return &domain.DeliveryServiceProduct{
		Code: "food_delivery", BaseFareIDR: 5000, PerKmIDR: 1000, IncludedDistanceKM: 1,
		PlatformFeePct: 10, PlatformCommissionPercent: 2.5, CourierPayoutPercent: 80,
	}, nil
}

type experimentRedisRepoStub struct {
	domain.RedisRepository
	saved *domain.PricingEstimateResponse
}

func (r *experimentRedisRepoStub) GetMultiplier(context.Context, string) (float64, error) {
	return 1, nil
}
func (r *experimentRedisRepoStub) SaveEstimate(_ context.Context, estimate *domain.PricingEstimateResponse) error {
	r.saved = estimate
	return nil
}

type experimentTaxStub struct{ domain.TaxService }

func (experimentTaxStub) CalculateOrderTax(context.Context, int64, int64, bool) (domain.TaxSnapshot, error) {
	return domain.TaxSnapshot{}, nil
}

type experimentConfigStub struct {
	domain.ConfigRepository
	policy     []byte
	experiment []byte
}

func (r experimentConfigStub) GetConfig(_ context.Context, key string) (*domain.SystemConfig, error) {
	switch key {
	case "dynamic_pricing_policy_default_food_delivery":
		return &domain.SystemConfig{Value: r.policy}, nil
	case foodPricingExperimentConfigKey:
		return &domain.SystemConfig{Value: r.experiment}, nil
	default:
		return nil, nil
	}
}
func (experimentConfigStub) GetFloatConfig(context.Context, string, float64) float64 { return 0 }
func (experimentConfigStub) GetIntConfig(context.Context, string, int) int           { return 0 }
func (experimentConfigStub) GetStringConfig(context.Context, string, string) string  { return "" }

func TestQuoteFoodPersistsDeterministicExperimentContract(t *testing.T) {
	policy, _ := json.Marshal(map[string]any{
		"policy_version": "marketplace-pricing-2026-v2", "market": "default", "service_code": "food_delivery",
		"zone_scope": "active_zone", "timezone": "Asia/Jakarta", "floor_multiplier": 1,
		"ceiling_multiplier": 1.4, "protected_cap_multiplier": 1.4, "peak_multiplier": 1,
		"peak_windows": []any{}, "fairness_reviewed": true,
	})
	experiment, _ := json.Marshal(map[string]any{
		"experiment_id": "food-exp", "service_code": "food_delivery", "market": "default",
		"enabled": true, "killed": false, "assignment_salt": "salt", "traffic_percent": 100,
		"control_pricing_rule_version":   "marketplace-pricing-2026-v2",
		"treatment_pricing_rule_version": "marketplace-pricing-2026-food-treatment-v1",
		"treatment_multiplier":           1.05,
	})
	redis := &experimentRedisRepoStub{}
	svc := &orderServiceImpl{
		foodRepo:    experimentFoodRepoStub{merchant: domain.FoodMerchantInfo{ID: "merchant-1", Address: "Jl. Merchant", Lat: -6.2, Lng: 106.8, IsOpen: true, VerificationStatus: "approved"}, item: domain.FoodMenuItemInfo{ID: "menu-1", MerchantID: "merchant-1", Name: "Nasi", Price: 25000, IsAvailable: true}},
		redisRepo:   redis,
		pricingRepo: experimentPricingRepoStub{},
		configRepo:  experimentConfigStub{policy: policy, experiment: experiment},
		taxSvc:      experimentTaxStub{},
	}
	quote, err := svc.QuoteFood(context.Background(), "customer-1", domain.CreateFoodOrderRequest{
		MerchantID: "merchant-1", Items: []domain.FoodOrderItemRequest{{MenuID: "menu-1", Quantity: 1}},
		DropoffAddress: "Jl. Customer", DropoffCity: "Jakarta", DropoffZipCode: "12345", DropoffLat: -6.21, DropoffLng: 106.81,
	})
	if err != nil {
		t.Fatalf("QuoteFood() error = %v", err)
	}
	if quote.ExperimentID != "food-exp" || quote.ExperimentVariant != "treatment" || quote.ExperimentAssignmentKey == "" {
		t.Fatalf("quote experiment contract incomplete: %+v", quote)
	}
	if quote.ExperimentPricingRuleVersion != "marketplace-pricing-2026-food-treatment-v1" || quote.PricingRuleVersion != quote.ExperimentPricingRuleVersion {
		t.Fatalf("pricing rule version was not recorded: %+v", quote)
	}
	if quote.SurgeMultiplier <= 1 || quote.SurgeMultiplier > 1.4 || quote.ExperimentQuoteWindowExpiresAt == nil || !quote.ExperimentQuoteWindowExpiresAt.After(time.Now()) {
		t.Fatalf("bounded quote treatment/window invalid: %+v", quote)
	}
	if redis.saved == nil || redis.saved.ExperimentAssignmentKey != quote.ExperimentAssignmentKey || redis.saved.ExperimentPricingRuleVersion != quote.ExperimentPricingRuleVersion {
		t.Fatalf("stored quote lost experiment assignment: %+v", redis.saved)
	}
	if redis.saved.SnapshotHash == "" || redis.saved.SnapshotHash != domain.QuoteSnapshotHash(*redis.saved) {
		t.Fatalf("stored quote snapshot hash is invalid: %+v", redis.saved)
	}
	if quote.SnapshotHash == "" || quote.SnapshotHash != domain.FoodQuoteSnapshotHash(*quote) {
		t.Fatalf("food quote snapshot hash is invalid: %+v", quote)
	}
}
