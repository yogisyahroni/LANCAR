package service

import (
	"context"
	"tembus/order-service/internal/domain"
	"testing"
)

type fakeFoodSponsoredRepo struct{}

func (fakeFoodSponsoredRepo) RecordFoodSponsoredEvent(context.Context, domain.FoodSponsoredEvent) (bool, error) {
	return true, nil
}

func TestFoodSponsoredServiceValidatesOrderAttribution(t *testing.T) {
	svc := NewFoodSponsoredService(fakeFoodSponsoredRepo{})
	validCampaign := "00000000-0000-0000-0000-000000000001"
	if _, err := svc.RecordEvent(context.Background(), "user-1", "merchant-1", domain.RecordFoodSponsoredEventRequest{CampaignID: validCampaign, EventType: "order", SessionID: "session-1"}); err == nil {
		t.Fatal("order attribution without order id must be rejected")
	}
	accepted, err := svc.RecordEvent(context.Background(), "user-1", "merchant-1", domain.RecordFoodSponsoredEventRequest{CampaignID: validCampaign, EventType: "click", SessionID: "session-1"})
	if err != nil || !accepted {
		t.Fatalf("valid click should be accepted: %v", err)
	}
}
