package domain

import "context"

type FoodSponsoredEvent struct {
	CampaignID string `json:"campaign_id"`
	MerchantID string `json:"merchant_id"`
	UserID     string `json:"user_id,omitempty"`
	EventType  string `json:"event_type"` // impression | click | order
	SessionID  string `json:"session_id"`
	OrderID    string `json:"order_id,omitempty"`
}

type RecordFoodSponsoredEventRequest struct {
	CampaignID string `json:"campaign_id" validate:"required"`
	EventType  string `json:"event_type" validate:"required,oneof=impression click order"`
	SessionID  string `json:"session_id" validate:"required,max=120"`
	OrderID    string `json:"order_id,omitempty"`
}

type FoodSponsoredRepository interface {
	RecordFoodSponsoredEvent(ctx context.Context, event FoodSponsoredEvent) (bool, error)
}

type FoodSponsoredService interface {
	RecordEvent(ctx context.Context, userID, merchantID string, req RecordFoodSponsoredEventRequest) (bool, error)
}
