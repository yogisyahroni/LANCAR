package domain

import "testing"

func TestCanonicalServiceCategoryForDoesNotInventUnknownCategories(t *testing.T) {
	tests := []struct {
		name     string
		order    Order
		expected *CanonicalServiceCategory
	}{
		{
			name:     "legacy food subtype",
			order:    Order{ServiceSubType: "food_delivery"},
			expected: canonicalCategoryPtr(CanonicalFood),
		},
		{
			name:     "aggregator provider",
			order:    Order{LogisticsProvider: "jne"},
			expected: canonicalCategoryPtr(CanonicalAggregator),
		},
		{
			name:     "unknown model",
			order:    Order{Model: "future_service"},
			expected: nil,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			actual := CanonicalServiceCategoryFor(&tt.order)
			if (actual == nil) != (tt.expected == nil) {
				t.Fatalf("category = %v, expected %v", actual, tt.expected)
			}
			if actual != nil && *actual != *tt.expected {
				t.Fatalf("category = %q, expected %q", *actual, *tt.expected)
			}
		})
	}
}

func TestApplyCanonicalOrderContractPreservesTypedFacts(t *testing.T) {
	order := &Order{
		ID:                   "order-1",
		CustomerID:           "customer-1",
		Model:                "aggregator",
		LogisticsProvider:    "jne",
		LogisticsServiceType: "REG",
		LogisticsTariffIDR:   12000,
		LogisticsNetCostIDR:  10000,
		StateVersion:         0,
	}

	order.ApplyCanonicalOrderContract()

	if order.ServiceCategory != CanonicalAggregator {
		t.Fatalf("service category = %q", order.ServiceCategory)
	}
	if order.ContractVersion != CurrentOrderContractVersion {
		t.Fatalf("contract version = %q", order.ContractVersion)
	}
	if order.StateVersion != 1 {
		t.Fatalf("state version = %d", order.StateVersion)
	}
	if order.ServiceMetadata.Aggregator == nil || order.ServiceMetadata.Aggregator.Provider != "jne" {
		t.Fatalf("aggregator metadata was not preserved: %+v", order.ServiceMetadata.Aggregator)
	}
}

func TestBuildOrderServiceMetadataKeepsRoadsideFactsStructured(t *testing.T) {
	condition := "flat"
	order := &Order{
		ServiceSubType: "tambal_ban_tubeless",
		TambalBanReport: &TambalBanReport{
			TireConditionBefore: &condition,
		},
	}

	metadata := BuildOrderServiceMetadata(order)
	if metadata.Roadside == nil {
		t.Fatal("roadside metadata is nil")
	}
	if metadata.Roadside.VehicleFacts["tire_condition_before"] != "flat" {
		t.Fatalf("roadside vehicle facts = %+v", metadata.Roadside.VehicleFacts)
	}
}

func canonicalCategoryPtr(category CanonicalServiceCategory) *CanonicalServiceCategory {
	return &category
}
