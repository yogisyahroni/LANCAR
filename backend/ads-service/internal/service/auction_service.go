package service

import (
	"sort"

	"tembus/ads-service/internal/domain"
)

type AuctionResult struct {
	Winner      *domain.AdCandidate `json:"winner,omitempty"`
	AuctionName string              `json:"auction_name"`
	Version     string              `json:"version"`
	TieBreak    string              `json:"tie_break"`
}

type AuctionService struct{}

func (AuctionService) Select(candidates []domain.AdCandidate, maxAds int) AuctionResult {
	eligible := make([]domain.AdCandidate, 0, len(candidates))
	for _, candidate := range candidates {
		if candidate.Eligible {
			eligible = append(eligible, candidate)
		}
	}
	sort.SliceStable(eligible, func(i, j int) bool {
		left, right := eligible[i], eligible[j]
		if left.RankScore() != right.RankScore() {
			return left.RankScore() > right.RankScore()
		}
		if left.Quality != right.Quality {
			return left.Quality > right.Quality
		}
		return left.Campaign.ID < right.Campaign.ID
	})
	if maxAds < 1 || len(eligible) == 0 {
		return AuctionResult{AuctionName: "contextual_quality_auction", Version: "ads-auction-v1", TieBreak: "campaign_id_ascending"}
	}
	winner := eligible[0]
	return AuctionResult{Winner: &winner, AuctionName: "contextual_quality_auction", Version: "ads-auction-v1", TieBreak: "campaign_id_ascending"}
}
