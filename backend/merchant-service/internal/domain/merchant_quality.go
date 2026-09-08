package domain

import "context"

// MerchantQualityComponents are independently measurable inputs. The score is
// deliberately not a projection of star rating: operational, availability,
// refund/cancel, and reviewed policy signals are included separately.
type MerchantQualityComponents struct {
	AcceptanceTimeout float64 `json:"acceptance_timeout"`
	PrepAccuracy      float64 `json:"prep_accuracy"`
	ItemAvailability  float64 `json:"item_availability"`
	CustomerReview    float64 `json:"customer_review"`
	RefundCancel      float64 `json:"refund_cancel"`
	SafetyPolicy      float64 `json:"safety_policy"`
}

type MerchantQualityEvidence struct {
	TotalOrders           int64 `json:"total_orders"`
	AcceptedOrders        int64 `json:"accepted_orders"`
	TimeoutOrders         int64 `json:"timeout_orders"`
	PrepSampleOrders      int64 `json:"prep_sample_orders"`
	UnavailableItems      int64 `json:"unavailable_items"`
	OrderedItems          int64 `json:"ordered_items"`
	RatingCount           int64 `json:"rating_count"`
	MerchantIssueOrders   int64 `json:"merchant_issue_orders"`
	ConfirmedPolicyIssues int64 `json:"confirmed_policy_issues"`
	MinimumOrders         int64 `json:"minimum_orders"`
	WindowDays            int64 `json:"window_days"`
}

type MerchantQualityAppeal struct {
	ID           string  `json:"id"`
	MerchantID   string  `json:"merchant_id"`
	ScorecardID  string  `json:"scorecard_id"`
	MetricCode   string  `json:"metric_code"`
	Reason       string  `json:"reason"`
	Status       string  `json:"status"`
	ReviewNote   string  `json:"review_note,omitempty"`
	ReviewedBy   string  `json:"reviewed_by,omitempty"`
	ReviewedRole string  `json:"reviewed_role,omitempty"`
	SubmittedAt  string  `json:"submitted_at"`
	ReviewedAt   *string `json:"reviewed_at,omitempty"`
}

type MerchantQualityScore struct {
	ID             string                    `json:"id"`
	MerchantID     string                    `json:"merchant_id"`
	MarketCode     string                    `json:"market_code"`
	PolicyVersion  string                    `json:"policy_version"`
	WindowDays     int                       `json:"window_days"`
	WindowStart    string                    `json:"window_start"`
	WindowEnd      string                    `json:"window_end"`
	ComputedAt     string                    `json:"computed_at"`
	Score          float64                   `json:"score"`
	Components     MerchantQualityComponents `json:"components"`
	Evidence       MerchantQualityEvidence   `json:"evidence"`
	SearchEligible bool                      `json:"search_eligible"`
	AdsEligible    bool                      `json:"ads_eligible"`
	OpenAppeal     *MerchantQualityAppeal    `json:"open_appeal,omitempty"`
}

type MerchantQualityAppealRequest struct {
	ScorecardID string `json:"scorecard_id"`
	MetricCode  string `json:"metric_code"`
	Reason      string `json:"reason"`
}

type MerchantQualityAppealReviewRequest struct {
	Status     string `json:"status"`
	ReviewNote string `json:"review_note"`
}

// MerchantQualityRepository is an optional extension of the existing report
// repository. Quality calculations remain in the merchant/report bounded
// context and use database functions for authoritative discovery gating.
type MerchantQualityRepository interface {
	QualityScore(ctx context.Context, merchantID string) (*MerchantQualityScore, error)
	SubmitQualityAppeal(ctx context.Context, merchantID, scorecardID, metricCode, reason string) (*MerchantQualityAppeal, error)
	ReviewQualityAppeal(ctx context.Context, actorID, actorRole, appealID, status, reviewNote string) (*MerchantQualityAppeal, error)
}
