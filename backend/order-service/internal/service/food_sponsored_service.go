package service

import (
	"context"
	"fmt"
	"strings"
	"tembus/order-service/internal/domain"

	"github.com/google/uuid"
)

type foodSponsoredService struct {
	repo domain.FoodSponsoredRepository
}

func NewFoodSponsoredService(repo domain.FoodSponsoredRepository) domain.FoodSponsoredService {
	return &foodSponsoredService{repo: repo}
}

func (s *foodSponsoredService) RecordEvent(ctx context.Context, userID, merchantID string, req domain.RecordFoodSponsoredEventRequest) (bool, error) {
	if strings.TrimSpace(userID) == "" || strings.TrimSpace(merchantID) == "" {
		return false, domain.ErrForbidden
	}
	if _, err := uuid.Parse(req.CampaignID); err != nil {
		return false, fmt.Errorf("invalid campaign id")
	}
	if req.EventType != "impression" && req.EventType != "click" && req.EventType != "order" {
		return false, fmt.Errorf("invalid sponsored event type")
	}
	if strings.TrimSpace(req.SessionID) == "" || len(req.SessionID) > 120 {
		return false, fmt.Errorf("session id is required")
	}
	if req.EventType == "order" {
		if _, err := uuid.Parse(req.OrderID); err != nil {
			return false, fmt.Errorf("order id is required for order attribution")
		}
	}
	return s.repo.RecordFoodSponsoredEvent(ctx, domain.FoodSponsoredEvent{CampaignID: req.CampaignID, MerchantID: merchantID, UserID: userID, EventType: req.EventType, SessionID: req.SessionID, OrderID: req.OrderID})
}
