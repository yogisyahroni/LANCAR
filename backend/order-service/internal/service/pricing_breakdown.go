package service

import (
	"context"
	"encoding/json"
	"strings"

	"tembus/order-service/internal/domain"
)

func pricingComponent(code string, kind domain.PricingComponentKind, amount int64, customerVisible bool) domain.PricingComponent {
	return domain.PricingComponent{
		Code:            code,
		AmountIDR:       amount,
		Kind:            kind,
		LabelKey:        code,
		CustomerVisible: customerVisible,
	}
}

// buildPricingBreakdown creates the single financial contract used by parcel
// and Food quotes. Labels are loaded from system_configs when present, while
// the component codes and formulas remain stable across markets.
func buildPricingBreakdown(ctx context.Context, configRepo domain.ConfigRepository, serviceCode, market, policyVersion string, components []domain.PricingComponent) (*domain.PricingBreakdown, error) {
	labels := domain.DefaultPricingComponentLabels()
	market = strings.TrimSpace(strings.ToLower(market))
	if market == "" {
		market = "default"
	}
	if configRepo != nil {
		for _, key := range []string{"pricing_component_labels_" + market, "pricing_component_labels_default"} {
			config, err := configRepo.GetConfig(ctx, key)
			if err != nil || config == nil || len(config.Value) == 0 {
				continue
			}
			var configured map[string]string
			if json.Unmarshal(config.Value, &configured) == nil {
				for labelKey, label := range configured {
					if strings.TrimSpace(label) != "" {
						labels[labelKey] = label
					}
				}
				break
			}
		}
	}
	for i := range components {
		if components[i].LabelKey == "" {
			components[i].LabelKey = components[i].Code
		}
		if _, ok := labels[components[i].LabelKey]; !ok {
			labels[components[i].LabelKey] = components[i].LabelKey
		}
	}
	breakdown := domain.PricingBreakdown{
		PolicyVersion:   policyVersion,
		Currency:        "IDR",
		Market:          market,
		ServiceCode:     serviceCode,
		Components:      components,
		ComponentLabels: labels,
	}
	calculated, err := breakdown.Recalculate()
	if err != nil {
		return nil, err
	}
	return &calculated, nil
}

func policyVersion(ctx context.Context, configRepo domain.ConfigRepository, fallback string) string {
	if configRepo == nil {
		return fallback
	}
	version := strings.TrimSpace(configRepo.GetStringConfig(ctx, "pricing_rule_version", fallback))
	if version == "" {
		return fallback
	}
	return version
}
