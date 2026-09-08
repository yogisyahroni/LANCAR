package domain

import (
	"context"
	"time"
)

// MerchantAd is a merchant-funded paid-visibility campaign. It deliberately
// has no discount, ETA, or rating fields: those remain separate authoritative
// facts owned by checkout, dispatch, and reviews.
type MerchantAd struct {
	ID                string    `json:"id"`
	MerchantID        string    `json:"merchant_id"`
	ProductType       string    `json:"product_type"`
	Name              string    `json:"name"`
	Description       string    `json:"description,omitempty"`
	Status            string    `json:"status"`
	CreativeHeadline  string    `json:"creative_headline"`
	CreativeBody      string    `json:"creative_body,omitempty"`
	CreativeImageURL  string    `json:"creative_image_url,omitempty"`
	TotalBudgetIDR    int64     `json:"total_budget_idr"`
	DailyBudgetIDR    int64     `json:"daily_budget_idr"`
	StartsAt          time.Time `json:"starts_at"`
	EndsAt            time.Time `json:"ends_at"`
	Impressions       int64     `json:"impressions"`
	Clicks            int64     `json:"clicks"`
	AttributedOrders  int64     `json:"attributed_orders"`
	AttributedRevenue int64     `json:"attributed_revenue_idr"`
	ChargedAmountIDR  int64     `json:"charged_amount_idr"`
	CreatedAt         time.Time `json:"created_at"`
}

type CreateMerchantAdRequest struct {
	Name             string `json:"name"`
	Description      string `json:"description,omitempty"`
	CreativeHeadline string `json:"creative_headline"`
	CreativeBody     string `json:"creative_body,omitempty"`
	CreativeImageURL string `json:"creative_image_url,omitempty"`
	TotalBudgetIDR   int64  `json:"total_budget_idr"`
	DailyBudgetIDR   int64  `json:"daily_budget_idr"`
	StartsAt         string `json:"starts_at"`
	EndsAt           string `json:"ends_at"`
	IdempotencyKey   string `json:"-"`
}

type MerchantMarketingMetric struct {
	Impressions      int64 `json:"impressions"`
	Clicks           int64 `json:"clicks"`
	AttributedOrders int64 `json:"attributed_orders"`
	RevenueIDR       int64 `json:"revenue_idr"`
	SpendIDR         int64 `json:"spend_idr"`
}

type MerchantMarketingPerformance struct {
	Period  string                  `json:"period"`
	Paid    MerchantMarketingMetric `json:"paid"`
	Organic MerchantMarketingMetric `json:"organic"`
}

type MerchantAdsRepository interface {
	Create(ctx context.Context, ad *MerchantAd, idempotencyKey, requestFingerprint, actorID string) (*MerchantAd, error)
	ListByMerchant(ctx context.Context, merchantID string, limit, offset int) ([]*MerchantAd, int, error)
	SetActive(ctx context.Context, adID, merchantID string, active bool) error
	Performance(ctx context.Context, merchantID, period string) (*MerchantMarketingPerformance, error)
}

type MerchantAdsService interface {
	Create(ctx context.Context, userID string, req CreateMerchantAdRequest) (*MerchantAd, error)
	List(ctx context.Context, userID string, page, pageSize int) ([]*MerchantAd, int, error)
	SetActive(ctx context.Context, userID, adID string, active bool) error
	Performance(ctx context.Context, userID, period string) (*MerchantMarketingPerformance, error)
}
