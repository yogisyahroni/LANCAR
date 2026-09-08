package service

import (
	"fmt"
	"strings"
)

type AnalyticsMetricDefinition struct {
	Name             string
	Description      string
	Unit             string
	NumeratorEvent   string
	DenominatorEvent string
	SourceOfTruth    string
	Exclusions       string
}

// AnalyticsMetricDefinitions is the governed metric vocabulary shared by
// dashboards, experimentation and ML feature generation. Consumers must read
// canonical events, not query transactional tables as an alternative source.
var AnalyticsMetricDefinitions = []AnalyticsMetricDefinition{
	{
		Name:             "gmv",
		Description:      "Gross customer order value for completed orders before refunds.",
		Unit:             "minor currency units by market",
		NumeratorEvent:   "order.completed.order_total_minor",
		DenominatorEvent: "order.completed",
		SourceOfTruth:    "canonical event stream",
		Exclusions:       "cancelled orders and non-authoritative quote values",
	},
	{
		Name:             "completed_order",
		Description:      "Unique orders with one authoritative completed event.",
		Unit:             "orders",
		NumeratorEvent:   "order.completed",
		DenominatorEvent: "none",
		SourceOfTruth:    "canonical event stream",
		Exclusions:       "duplicate event_id or replayed dedupe_key",
	},
	{
		Name:             "cancellation_rate",
		Description:      "Unique cancelled orders divided by created orders in the same cohort window.",
		Unit:             "percent",
		NumeratorEvent:   "order.cancelled",
		DenominatorEvent: "order.created",
		SourceOfTruth:    "canonical event stream",
		Exclusions:       "duplicate events and cancellations after completion",
	},
	{
		Name:             "refund_rate",
		Description:      "Orders with an authoritative completed refund divided by completed orders.",
		Unit:             "percent",
		NumeratorEvent:   "refund.created with status=completed",
		DenominatorEvent: "order.completed",
		SourceOfTruth:    "canonical payment/refund event stream",
		Exclusions:       "failed, pending, or duplicated refunds",
	},
	{
		Name:             "active_courier",
		Description:      "Distinct couriers whose latest canonical activity interval is active at the observation time.",
		Unit:             "couriers",
		NumeratorEvent:   "courier.active minus courier.inactive",
		DenominatorEvent: "none",
		SourceOfTruth:    "canonical event stream",
		Exclusions:       "stale intervals beyond the market activity window",
	},
	{
		Name:             "active_merchant",
		Description:      "Distinct merchants whose latest canonical operating interval is active at the observation time.",
		Unit:             "merchants",
		NumeratorEvent:   "merchant.active minus merchant.inactive",
		DenominatorEvent: "none",
		SourceOfTruth:    "canonical event stream",
		Exclusions:       "stale intervals beyond the market activity window",
	},
	{
		Name:             "sla_compliance",
		Description:      "Eligible completed service events delivered at or before their market SLA deadline.",
		Unit:             "percent",
		NumeratorEvent:   "sla.measured with met=true",
		DenominatorEvent: "sla.measured with eligible=true",
		SourceOfTruth:    "canonical event stream",
		Exclusions:       "ineligible records, duplicate measurements, and missing deadlines",
	},
}

func ValidateAnalyticsMetricDefinitions() error {
	seen := make(map[string]struct{}, len(AnalyticsMetricDefinitions))
	for _, definition := range AnalyticsMetricDefinitions {
		if strings.TrimSpace(definition.Name) == "" || strings.TrimSpace(definition.SourceOfTruth) == "" {
			return fmt.Errorf("analytics definition must have a name and source of truth")
		}
		if _, exists := seen[definition.Name]; exists {
			return fmt.Errorf("analytics definition %q is duplicated", definition.Name)
		}
		seen[definition.Name] = struct{}{}
		if definition.SourceOfTruth != "canonical event stream" && definition.SourceOfTruth != "canonical payment/refund event stream" {
			return fmt.Errorf("analytics definition %q uses an ungoverned source", definition.Name)
		}
	}
	return nil
}
