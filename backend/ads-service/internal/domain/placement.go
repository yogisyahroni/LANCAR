package domain

import "strings"

type Placement string

const (
	PlacementHomeFirstViewport Placement = "home_first_viewport"
	PlacementFoodDiscovery     Placement = "food_discovery"
	PlacementFoodSearch        Placement = "food_search"
	PlacementAdFreeCheckout    Placement = "checkout"
	PlacementAdFreePayment     Placement = "payment"
	PlacementAdFreeTracking    Placement = "tracking"
	PlacementAdFreeSupport     Placement = "support"
	PlacementAdFreeClaim       Placement = "claim"
	PlacementTambalBooking     Placement = "tambal_booking"
	PlacementTambalMatching    Placement = "tambal_matching"
	PlacementTambalActive      Placement = "tambal_active"
	PlacementTowingBooking     Placement = "towing_booking"
	PlacementTowingMatching    Placement = "towing_matching"
	PlacementTowingActive      Placement = "towing_active"
	PlacementAggregatorCompare Placement = "aggregator_compare"
)

type PlacementPolicy struct {
	Placement           Placement `json:"placement"`
	MaxAds              int       `json:"max_ads"`
	MaxDensityPercent   int       `json:"max_density_percent"`
	MinOrganicVisible   int       `json:"min_organic_visible"`
	AdjacentSponsored   bool      `json:"adjacent_sponsored"`
	FrequencyCapPerHour int       `json:"frequency_cap_per_hour"`
	ProtectedAdFree     bool      `json:"protected_ad_free"`
	Fallback            string    `json:"fallback"`
}

func DefaultPlacementPolicies() map[Placement]PlacementPolicy {
	return map[Placement]PlacementPolicy{
		PlacementHomeFirstViewport: {Placement: PlacementHomeFirstViewport, MaxAds: 1, MaxDensityPercent: 20, MinOrganicVisible: 1, FrequencyCapPerHour: 3, Fallback: "organic"},
		PlacementFoodDiscovery:     {Placement: PlacementFoodDiscovery, MaxAds: 1, MaxDensityPercent: 25, MinOrganicVisible: 1, FrequencyCapPerHour: 5, Fallback: "organic"},
		PlacementFoodSearch:        {Placement: PlacementFoodSearch, MaxAds: 2, MaxDensityPercent: 25, MinOrganicVisible: 3, FrequencyCapPerHour: 5, Fallback: "organic"},
		PlacementAdFreeCheckout:    {Placement: PlacementAdFreeCheckout, ProtectedAdFree: true, Fallback: "transaction"},
		PlacementAdFreePayment:     {Placement: PlacementAdFreePayment, ProtectedAdFree: true, Fallback: "transaction"},
		PlacementAdFreeTracking:    {Placement: PlacementAdFreeTracking, ProtectedAdFree: true, Fallback: "transaction"},
		PlacementAdFreeSupport:     {Placement: PlacementAdFreeSupport, ProtectedAdFree: true, Fallback: "transaction"},
		PlacementAdFreeClaim:       {Placement: PlacementAdFreeClaim, ProtectedAdFree: true, Fallback: "transaction"},
		PlacementTambalBooking:     {Placement: PlacementTambalBooking, ProtectedAdFree: true, Fallback: "emergency"},
		PlacementTambalMatching:    {Placement: PlacementTambalMatching, ProtectedAdFree: true, Fallback: "emergency"},
		PlacementTambalActive:      {Placement: PlacementTambalActive, ProtectedAdFree: true, Fallback: "emergency"},
		PlacementTowingBooking:     {Placement: PlacementTowingBooking, ProtectedAdFree: true, Fallback: "emergency"},
		PlacementTowingMatching:    {Placement: PlacementTowingMatching, ProtectedAdFree: true, Fallback: "emergency"},
		PlacementTowingActive:      {Placement: PlacementTowingActive, ProtectedAdFree: true, Fallback: "emergency"},
		PlacementAggregatorCompare: {Placement: PlacementAggregatorCompare, ProtectedAdFree: true, Fallback: "comparison"},
	}
}

func IsProtectedAdFree(raw string) bool {
	p := strings.ToLower(strings.TrimSpace(raw))
	return DefaultPlacementPolicies()[Placement(p)].ProtectedAdFree
}
