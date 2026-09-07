package service

import (
	"context"
	"fmt"
	"strings"
	"tembus/order-service/internal/domain"
)

type foodMembershipService struct {
	repo domain.FoodMembershipRepository
}

func NewFoodMembershipService(repo domain.FoodMembershipRepository) domain.FoodMembershipService {
	return &foodMembershipService{repo: repo}
}

func (s *foodMembershipService) ListPlans(ctx context.Context) ([]domain.FoodMembershipPlan, error) {
	if s.repo == nil {
		return nil, fmt.Errorf("membership repository is not configured")
	}
	return s.repo.ListFoodMembershipPlans(ctx)
}

func (s *foodMembershipService) GetEntitlement(ctx context.Context, userID string) (*domain.FoodMembershipEntitlement, error) {
	if strings.TrimSpace(userID) == "" {
		return nil, domain.ErrForbidden
	}
	if s.repo == nil {
		return nil, fmt.Errorf("membership repository is not configured")
	}
	entitlement, _, err := s.repo.GetActiveFoodMembership(ctx, userID)
	return entitlement, err
}

func (s *foodMembershipService) Subscribe(ctx context.Context, userID, planID, idempotencyKey string) (*domain.FoodMembershipEntitlement, error) {
	if strings.TrimSpace(userID) == "" {
		return nil, domain.ErrForbidden
	}
	if err := domain.ValidateMembershipSubscription(planID, idempotencyKey); err != nil {
		return nil, err
	}
	if s.repo == nil {
		return nil, fmt.Errorf("membership repository is not configured")
	}
	// The entitlement is intentionally pending_payment. A payment provider
	// callback must activate it; this endpoint never fabricates a paid plan.
	return s.repo.CreatePendingFoodMembership(ctx, userID, planID, idempotencyKey)
}

func (s *foodMembershipService) CalculateBenefit(ctx context.Context, userID string, subtotalIDR, deliveryFeeIDR int64, deliveryMethod string) (domain.FoodMembershipBenefit, error) {
	if s.repo == nil {
		return domain.FoodMembershipBenefit{}, fmt.Errorf("membership repository is not configured")
	}
	entitlement, plan, err := s.repo.GetActiveFoodMembership(ctx, userID)
	if err != nil {
		return domain.FoodMembershipBenefit{}, err
	}
	return domain.CalculateFoodMembershipBenefit(entitlement, plan, subtotalIDR, deliveryFeeIDR, deliveryMethod), nil
}
