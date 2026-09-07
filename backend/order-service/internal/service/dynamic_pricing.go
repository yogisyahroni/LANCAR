package service

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"strings"
	"tembus/order-service/internal/domain"
	"time"
)

const defaultPricingTimezone = "Asia/Jakarta"

type pricingPeakWindow struct {
	StartHour int `json:"start_hour"`
	EndHour   int `json:"end_hour"`
}

// dynamicPricingPolicy is loaded from system_configs. The protected cap is an
// independent consumer-safety ceiling: ordinary experiments can never exceed
// min(ceiling_multiplier, protected_cap_multiplier).
type dynamicPricingPolicy struct {
	PolicyVersion          string              `json:"policy_version"`
	Market                 string              `json:"market"`
	ServiceCode            string              `json:"service_code"`
	ZoneScope              string              `json:"zone_scope"`
	Timezone               string              `json:"timezone"`
	FloorMultiplier        float64             `json:"floor_multiplier"`
	CeilingMultiplier      float64             `json:"ceiling_multiplier"`
	ProtectedCapMultiplier float64             `json:"protected_cap_multiplier"`
	PeakMultiplier         float64             `json:"peak_multiplier"`
	PeakWindows            []pricingPeakWindow `json:"peak_windows"`
	FairnessReviewed       bool                `json:"fairness_reviewed"`
}

type dynamicPricingDecision struct {
	Multiplier       float64
	PeakApplied      bool
	EffectiveCeiling float64
	TriggerContext   map[string]string
}

func defaultDynamicPricingPolicy(serviceCode, market string) dynamicPricingPolicy {
	ceiling := 1.5
	peak := 1.10
	switch {
	case strings.HasPrefix(serviceCode, "tambal_ban"), strings.HasPrefix(serviceCode, "towing"):
		// Emergency/roadside pricing is intentionally protected below ordinary
		// package experimentation to avoid exploiting urgent demand.
		ceiling = 1.20
		peak = 1.0
	case serviceCode == "food_delivery":
		ceiling = 1.40
	}
	return dynamicPricingPolicy{
		PolicyVersion:          "marketplace-pricing-2026-v2",
		Market:                 market,
		ServiceCode:            serviceCode,
		ZoneScope:              "active_zone",
		Timezone:               defaultPricingTimezone,
		FloorMultiplier:        1,
		CeilingMultiplier:      ceiling,
		ProtectedCapMultiplier: ceiling,
		PeakMultiplier:         peak,
		PeakWindows: []pricingPeakWindow{
			{StartHour: 7, EndHour: 9},
			{StartHour: 17, EndHour: 20},
		},
		FairnessReviewed: true,
	}
}

func resolveDynamicPricingPolicy(ctx context.Context, repo domain.ConfigRepository, serviceCode, market string) (dynamicPricingPolicy, error) {
	market = normalizePricingMarket(market)
	policy := defaultDynamicPricingPolicy(serviceCode, market)
	if repo == nil {
		return policy, policy.Validate()
	}

	keys := []string{
		"dynamic_pricing_policy_" + market + "_" + serviceCode,
		"dynamic_pricing_policy_default_" + serviceCode,
		"dynamic_pricing_policy_" + market,
		"dynamic_pricing_policy_default",
	}
	for _, key := range keys {
		config, err := repo.GetConfig(ctx, key)
		if err != nil {
			return policy, fmt.Errorf("load dynamic pricing policy %s: %w", key, err)
		}
		if config == nil || len(config.Value) == 0 {
			continue
		}
		if err := json.Unmarshal(config.Value, &policy); err != nil {
			return policy, fmt.Errorf("decode dynamic pricing policy %s: %w", key, err)
		}
		break
	}
	if policy.PolicyVersion == "" {
		policy.PolicyVersion = policyVersion(ctx, repo, "marketplace-pricing-2026-v1")
	}
	// A generic market/default config supplies bounds, but the quote context
	// must always carry the actual server-resolved market and service.
	policy.Market = market
	policy.ServiceCode = serviceCode
	if policy.ZoneScope == "" {
		policy.ZoneScope = "active_zone"
	}
	if policy.Timezone == "" {
		policy.Timezone = defaultPricingTimezone
	}
	return policy, policy.Validate()
}

func (p dynamicPricingPolicy) Validate() error {
	if strings.TrimSpace(p.PolicyVersion) == "" || strings.TrimSpace(p.ServiceCode) == "" || strings.TrimSpace(p.Market) == "" {
		return fmt.Errorf("dynamic pricing policy metadata is incomplete")
	}
	if p.FloorMultiplier < 1 || p.CeilingMultiplier < p.FloorMultiplier || p.ProtectedCapMultiplier < p.FloorMultiplier {
		return fmt.Errorf("dynamic pricing policy bounds are invalid")
	}
	if p.PeakMultiplier < 1 {
		return fmt.Errorf("dynamic pricing peak multiplier cannot be below one")
	}
	if !p.FairnessReviewed {
		return fmt.Errorf("dynamic pricing policy requires fairness review")
	}
	for _, window := range p.PeakWindows {
		if window.StartHour < 0 || window.StartHour >= 24 || window.EndHour <= window.StartHour || window.EndHour > 24 {
			return fmt.Errorf("dynamic pricing peak window is invalid")
		}
	}
	return nil
}

func (p dynamicPricingPolicy) Evaluate(baseMultiplier float64, zone string, now time.Time) (dynamicPricingDecision, error) {
	if err := p.Validate(); err != nil {
		return dynamicPricingDecision{}, err
	}
	ceiling := math.Min(p.CeilingMultiplier, p.ProtectedCapMultiplier)
	if ceiling < p.FloorMultiplier {
		return dynamicPricingDecision{}, fmt.Errorf("dynamic pricing protected cap is below floor")
	}
	location, err := time.LoadLocation(p.Timezone)
	if err != nil {
		return dynamicPricingDecision{}, fmt.Errorf("load pricing timezone %q: %w", p.Timezone, err)
	}
	localHour := now.In(location).Hour()
	peakApplied := false
	for _, window := range p.PeakWindows {
		if localHour >= window.StartHour && localHour < window.EndHour {
			peakApplied = true
			break
		}
	}
	multiplier := baseMultiplier
	if peakApplied {
		multiplier *= p.PeakMultiplier
	}
	if multiplier < p.FloorMultiplier {
		multiplier = p.FloorMultiplier
	}
	if multiplier > ceiling {
		multiplier = ceiling
	}
	return dynamicPricingDecision{
		Multiplier:       multiplier,
		PeakApplied:      peakApplied,
		EffectiveCeiling: ceiling,
		TriggerContext: map[string]string{
			"policy_version":       p.PolicyVersion,
			"market":               p.Market,
			"service_code":         p.ServiceCode,
			"zone_scope":           p.ZoneScope,
			"zone":                 zone,
			"timezone":             p.Timezone,
			"base_multiplier":      strconv.FormatFloat(baseMultiplier, 'f', 4, 64),
			"peak_applied":         strconv.FormatBool(peakApplied),
			"peak_multiplier":      strconv.FormatFloat(p.PeakMultiplier, 'f', 4, 64),
			"floor_multiplier":     strconv.FormatFloat(p.FloorMultiplier, 'f', 4, 64),
			"ceiling_multiplier":   strconv.FormatFloat(p.CeilingMultiplier, 'f', 4, 64),
			"protected_cap":        strconv.FormatFloat(p.ProtectedCapMultiplier, 'f', 4, 64),
			"effective_multiplier": strconv.FormatFloat(multiplier, 'f', 4, 64),
		},
	}, nil
}

func normalizePricingMarket(market string) string {
	market = strings.ToLower(strings.TrimSpace(market))
	if market == "" {
		return "default"
	}
	return strings.NewReplacer(" ", "_", "/", "_", "\\", "_").Replace(market)
}

type pricingZoneResolver interface {
	ResolveZoneCode(ctx context.Context, lat, lng float64) (string, error)
}

func resolveQuoteZone(ctx context.Context, repo domain.PricingRepository, lat, lng float64) (string, error) {
	resolver, ok := repo.(pricingZoneResolver)
	if !ok {
		return "global", nil
	}
	zone, err := resolver.ResolveZoneCode(ctx, lat, lng)
	if err != nil {
		return "", fmt.Errorf("resolve pricing zone: %w", err)
	}
	if strings.TrimSpace(zone) == "" {
		return "global", nil
	}
	return zone, nil
}

func evaluateDynamicPricing(ctx context.Context, redisRepo domain.RedisRepository, pricingRepo domain.PricingRepository, configRepo domain.ConfigRepository, serviceCode, market string, lat, lng float64) (dynamicPricingPolicy, dynamicPricingDecision, error) {
	if redisRepo == nil {
		return dynamicPricingPolicy{}, dynamicPricingDecision{}, fmt.Errorf("dynamic pricing redis dependency not wired")
	}
	zoneCode, err := resolveQuoteZone(ctx, pricingRepo, lat, lng)
	if err != nil {
		return dynamicPricingPolicy{}, dynamicPricingDecision{}, err
	}
	baseMultiplier, err := redisRepo.GetMultiplier(ctx, zoneCode)
	if err != nil {
		return dynamicPricingPolicy{}, dynamicPricingDecision{}, fmt.Errorf("get dynamic pricing multiplier: %w", err)
	}
	policy, err := resolveDynamicPricingPolicy(ctx, configRepo, serviceCode, market)
	if err != nil {
		return dynamicPricingPolicy{}, dynamicPricingDecision{}, err
	}
	decision, err := policy.Evaluate(baseMultiplier, zoneCode, time.Now())
	if err != nil {
		return dynamicPricingPolicy{}, dynamicPricingDecision{}, err
	}
	// ECON-2026-008: emergency rollback disables both zone surge and peak
	// pricing. The policy/version remains in the decision for audit; quote
	// validation will requote an affected quote normally.
	if configRepo != nil && strings.EqualFold(configRepo.GetStringConfig(ctx, "marketplace_pricing_kill_switch", "false"), "true") {
		decision.Multiplier = 1
		decision.PeakApplied = false
		decision.TriggerContext["rollback_kill_switch"] = "true"
		decision.TriggerContext["rollback_mode"] = "base_multiplier"
	}
	return policy, decision, nil
}

func dynamicPriceAdjustment(baseFee int64, multiplier float64) int64 {
	return int64(math.Round(float64(baseFee) * (multiplier - 1)))
}

func dynamicPricingQuoteRequiresValidation(quote *domain.PricingEstimateResponse) bool {
	if quote == nil {
		return false
	}
	return strings.HasPrefix(strings.ToLower(strings.TrimSpace(quote.PricingRuleVersion)), "marketplace-pricing-2026-v2") ||
		(quote.PricingBreakdown != nil && len(quote.PricingBreakdown.TriggerContext) > 0)
}

func validateDynamicPricingQuote(ctx context.Context, redisRepo domain.RedisRepository, pricingRepo domain.PricingRepository, configRepo domain.ConfigRepository, quote *domain.PricingEstimateResponse) error {
	if !dynamicPricingQuoteRequiresValidation(quote) {
		return nil
	}
	policy, decision, err := evaluateDynamicPricing(ctx, redisRepo, pricingRepo, configRepo, quote.Model, quote.Market, quote.PickupLat, quote.PickupLng)
	if err != nil {
		return fmt.Errorf("validate dynamic pricing quote: %w", err)
	}
	if quote.PricingRuleVersion != policy.PolicyVersion || math.Abs(quote.SurgeMultiplier-decision.Multiplier) > 0.0001 {
		return &domain.RequoteRequiredError{
			QuoteID: quote.QuoteIDOrEstimateID(), CurrentTotal: quote.TotalPriceIDR,
			Reason: "dynamic pricing policy atau multiplier berubah sejak quote dibuat",
		}
	}
	return nil
}
