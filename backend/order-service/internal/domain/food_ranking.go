package domain

import "sort"

// FoodDiscoveryRankingVariant is deliberately a server-configured, stable
// experiment. No customer PII or per-user behavioral profile is required.
const (
	FoodRankingDistanceFirst = "distance_first"
	FoodRankingQualityFirst  = "quality_first"
)

// RankFoodMerchants applies aggregate discovery signals only. Rating
// confidence is shrunk toward a neutral cold-start prior, preventing one new
// review from outranking established merchants. Commercial commission is
// intentionally not a FoodMerchantInfo field and can never influence this
// organic score; sponsored placement remains a separately labelled signal.
// The caller owns the returned slice.
func RankFoodMerchants(input []FoodMerchantInfo, variant string) []FoodMerchantInfo {
	result := append([]FoodMerchantInfo(nil), input...)
	if variant != FoodRankingQualityFirst {
		variant = FoodRankingDistanceFirst
	}
	score := func(m FoodMerchantInfo) float64 {
		distance := 0.0
		if m.DistanceKM != nil {
			distance = *m.DistanceKM
		}
		distanceScore := 1.0 - minFloat(distance/20.0, 1.0)
		rating := 4.0
		if m.AvgRating != nil && *m.AvgRating > 0 {
			rating = *m.AvgRating
		}
		confidence := float64(m.RatingCount) / float64(m.RatingCount+10)
		qualityScore := ((rating*confidence + 4.0*(1-confidence)) / 5.0)
		if variant == FoodRankingQualityFirst {
			return qualityScore*0.9 + distanceScore*0.1
		}
		return distanceScore*0.7 + qualityScore*0.3
	}
	sort.SliceStable(result, func(i, j int) bool {
		if result[i].IsSponsored != result[j].IsSponsored {
			return result[i].IsSponsored
		}
		return score(result[i]) > score(result[j])
	})
	return result
}

func minFloat(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}
