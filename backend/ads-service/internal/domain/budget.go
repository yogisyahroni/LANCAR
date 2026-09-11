package domain

type Budget struct {
	Currency      string `json:"currency"`
	TotalMinor    int64  `json:"total_minor"`
	DailyMinor    int64  `json:"daily_minor"`
	SpentMinor    int64  `json:"spent_minor"`
	BillingModel  string `json:"billing_model"`
	AccountPolicy string `json:"account_policy"`
}

func (b Budget) Remaining() int64 {
	remaining := b.TotalMinor - b.SpentMinor
	if remaining < 0 {
		return 0
	}
	return remaining
}
