package domain

type BidStrategy struct {
	Kind     string `json:"kind"`
	MaxMinor int64  `json:"max_minor"`
	Goal     string `json:"goal,omitempty"`
	Version  int    `json:"version"`
}

type AdCandidate struct {
	Campaign         Campaign
	Relevance        float64
	Quality          float64
	Eligible         bool
	Reason           string
	MerchantOpen     bool
	Serviceable      bool
	CatalogAvailable bool
	RiskApproved     bool
}

func (c AdCandidate) RankScore() float64 {
	return float64(c.Campaign.Bid.MaxMinor) * c.Relevance * c.Quality
}
