package repository

import (
	"testing"

	"tembus/search-service/internal/domain"
)

func TestApplyMerchandisingRulesPreservesSafeOrganicOrder(t *testing.T) {
	items := []domain.Document{
		{EntityID: "organic-1", Title: "one", RankScore: 0.9},
		{EntityID: "organic-2", Title: "two", RankScore: 0.8},
		{EntityID: "organic-3", Title: "three", RankScore: 0.7},
	}
	rules := []domain.MerchandisingRule{
		{EntityID: "organic-2", Action: "pin", Scope: map[string]string{"service_code": "food_delivery"}},
		{EntityID: "organic-3", Action: "exclude"},
	}
	got := applyMerchandisingRules(items, rules, domain.Query{Service: "food_delivery"}, domain.Intent{Service: "food_delivery"})
	if len(got) != 2 || got[0].EntityID != "organic-2" || got[1].EntityID != "organic-1" {
		t.Fatalf("unexpected bounded merchandising order: %+v", got)
	}
}
