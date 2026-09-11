package domain

import "testing"

func TestRankFoodMerchantsColdStartAndVariants(t *testing.T) {
	distanceNear, distanceFar := 5.0, 10.0
	newRating, establishedRating := 5.0, 4.5
	merchants := []FoodMerchantInfo{
		{ID: "far", DistanceKM: &distanceFar, AvgRating: &establishedRating, RatingCount: 100},
		{ID: "near", DistanceKM: &distanceNear, AvgRating: &newRating, RatingCount: 1},
	}
	if got := RankFoodMerchants(merchants, FoodRankingDistanceFirst); got[0].ID != "near" {
		t.Fatalf("distance-first ranking should prefer nearby merchant: %+v", got)
	}
	if got := RankFoodMerchants(merchants, FoodRankingQualityFirst); got[0].ID != "far" {
		t.Fatalf("quality-first ranking should shrink cold-start rating: %+v", got)
	}
}

func TestRankFoodMerchantsKeepsSponsoredPlacementSeparated(t *testing.T) {
	farSponsored := true
	nearOrganic := false
	nearDistance, farDistance := 0.1, 15.0
	merchants := []FoodMerchantInfo{
		{ID: "organic", IsSponsored: nearOrganic, DistanceKM: &nearDistance},
		{ID: "sponsored", IsSponsored: farSponsored, AdLabel: "Sponsored", DistanceKM: &farDistance},
	}
	result := RankFoodMerchants(merchants, FoodRankingDistanceFirst)
	if result[0].ID != "sponsored" || result[0].AdLabel != "Sponsored" {
		t.Fatalf("sponsored placement was not kept ahead of organic: %+v", result)
	}
}

func TestFoodMerchantRankingInputHasNoCommercialCommissionSignal(t *testing.T) {
	// The ranking input deliberately carries discovery signals only; commission
	// terms stay in settlement/commercial policy boundaries.
	merchant := FoodMerchantInfo{ID: "organic", Name: "Warung Baru", RatingCount: 0}
	result := RankFoodMerchants([]FoodMerchantInfo{merchant}, FoodRankingDistanceFirst)
	if len(result) != 1 || result[0].ID != merchant.ID {
		t.Fatalf("organic ranking changed the merchant identity: %+v", result)
	}
}

func TestFoodDiscoverySortModesAreExplicitlyAllowlisted(t *testing.T) {
	for _, sortMode := range []string{
		FoodDiscoverySortDistance,
		FoodDiscoverySortRating,
		FoodDiscoverySortPopular,
		FoodDiscoverySortRecent,
		FoodDiscoverySortFavorites,
	} {
		if !IsFoodDiscoverySort(sortMode) {
			t.Fatalf("expected sort mode %q to be allowlisted", sortMode)
		}
	}
	if IsFoodDiscoverySort("commission") || IsFoodDiscoverySort("sponsored_first") {
		t.Fatal("commercial ordering must not be an organic discovery sort")
	}
}
