package domain

import "time"

type AdEventType string

const (
	EventImpression AdEventType = "impression"
	EventClick      AdEventType = "click"
	EventConversion AdEventType = "conversion"
)

type DeliveryTokenClaims struct {
	CampaignID  string    `json:"campaign_id"`
	CreativeID  string    `json:"creative_id,omitempty"`
	Placement   string    `json:"placement"`
	CampaignVer int       `json:"campaign_version"`
	SelectedAt  time.Time `json:"selected_at"`
	ExpiresAt   time.Time `json:"expires_at"`
	RequestHash string    `json:"request_hash"`
}

type DeliveryContext struct {
	Placement string
	Market    string
	Session   string
	UserHash  string
	Intent    string
}

type DeliveryItem struct {
	CampaignID       string       `json:"campaign_id"`
	MerchantID       string       `json:"merchant_id"`
	CreativeHeadline string       `json:"creative_headline"`
	CreativeBody     string       `json:"creative_body,omitempty"`
	CreativeImageURL string       `json:"creative_image_url,omitempty"`
	CreativeAltText  string       `json:"creative_alt_text"`
	AdDeliveryToken  string       `json:"ad_delivery_token"`
	SourceType       string       `json:"source_type"`
	DisclosureLabel  string       `json:"disclosure_label"`
	OrganicFacts     OrganicFacts `json:"organic_facts"`
}

type OrganicFacts struct {
	Rating       *float64 `json:"rating,omitempty"`
	ETAMinutes   *int     `json:"eta_minutes,omitempty"`
	Serviceable  bool     `json:"serviceable"`
	Availability string   `json:"availability"`
}

type AdEvent struct {
	ID              string
	CampaignID      string
	EventType       AdEventType
	Placement       string
	DeliveryToken   string
	TokenHash       string
	UserHash        string
	SessionHash     string
	CostMinor       int64
	Currency        string
	BillingModel    string
	CampaignVersion int
	IdempotencyKey  string
	OrderID         string
	CreatedAt       time.Time
}

type Performance struct {
	CampaignID               string        `json:"campaign_id"`
	AttributionModel         string        `json:"attribution_model"`
	AttributionWindowMinutes int           `json:"attribution_window_minutes"`
	AttributionVersion       string        `json:"attribution_version"`
	Impressions              int64         `json:"impressions"`
	ViewableImpressions      int64         `json:"viewable_impressions"`
	Clicks                   int64         `json:"clicks"`
	Orders                   int64         `json:"orders"`
	SpendMinor               int64         `json:"spend_minor"`
	AttributedRevenueMinor   int64         `json:"attributed_revenue_minor"`
	InvalidTrafficMinor      int64         `json:"invalid_traffic_minor"`
	OrganicBaseline          OrganicMetric `json:"organic_baseline"`
}

type OrganicMetric struct {
	Impressions int64 `json:"impressions"`
	Orders      int64 `json:"orders"`
}
