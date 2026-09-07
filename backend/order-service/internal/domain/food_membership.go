package domain

import (
	"context"
	"fmt"
	"strings"
	"time"
)

const (
	MembershipPending   = "pending_payment"
	MembershipActive    = "active"
	MembershipExpired   = "expired"
	MembershipCancelled = "cancelled"
)

type FoodMembershipPlan struct {
	ID                 string `json:"id"`
	Name               string `json:"name"`
	MonthlyFeeIDR      int64  `json:"monthly_fee_idr"`
	FreeDeliveryCapIDR int64  `json:"free_delivery_cap_idr"`
	MinimumSubtotalIDR int64  `json:"minimum_subtotal_idr"`
	Active             bool   `json:"active"`
}

type FoodMembershipEntitlement struct {
	ID                       string    `json:"id"`
	UserID                   string    `json:"user_id"`
	PlanID                   string    `json:"plan_id"`
	Status                   string    `json:"status"`
	CurrentPeriodStart       time.Time `json:"current_period_start"`
	CurrentPeriodEnd         time.Time `json:"current_period_end"`
	FreeDeliveryUsedIDR      int64     `json:"free_delivery_used_idr"`
	FreeDeliveryRemainingIDR int64     `json:"free_delivery_remaining_idr"`
}

type FoodMembershipBenefit struct {
	Eligible      bool   `json:"eligible"`
	Reason        string `json:"reason"`
	DiscountIDR   int64  `json:"discount_idr"`
	SubsidyIDR    int64  `json:"subsidy_idr"`
	EntitlementID string `json:"entitlement_id,omitempty"`
}

type FoodMembershipRepository interface {
	ListFoodMembershipPlans(ctx context.Context) ([]FoodMembershipPlan, error)
	GetActiveFoodMembership(ctx context.Context, userID string) (*FoodMembershipEntitlement, *FoodMembershipPlan, error)
	CreatePendingFoodMembership(ctx context.Context, userID, planID, idempotencyKey string) (*FoodMembershipEntitlement, error)
	RecordFoodMembershipSubsidy(ctx context.Context, entitlementID, orderID string, amountIDR int64) error
}

type FoodMembershipService interface {
	ListPlans(ctx context.Context) ([]FoodMembershipPlan, error)
	GetEntitlement(ctx context.Context, userID string) (*FoodMembershipEntitlement, error)
	Subscribe(ctx context.Context, userID, planID, idempotencyKey string) (*FoodMembershipEntitlement, error)
	CalculateBenefit(ctx context.Context, userID string, subtotalIDR, deliveryFeeIDR int64, deliveryMethod string) (FoodMembershipBenefit, error)
}

// CalculateFoodMembershipBenefit is pure and deliberately does not mutate
// usage. Consumption belongs to the authoritative order/payment flow.
func CalculateFoodMembershipBenefit(entitlement *FoodMembershipEntitlement, plan *FoodMembershipPlan, subtotalIDR, deliveryFeeIDR int64, deliveryMethod string) FoodMembershipBenefit {
	benefit := FoodMembershipBenefit{}
	if entitlement == nil || plan == nil || entitlement.Status != MembershipActive {
		benefit.Reason = "membership_inactive"
		return benefit
	}
	if deliveryMethod == DeliveryMethodPickup {
		benefit.Reason = "pickup_excluded"
		return benefit
	}
	if deliveryMethod != "" && deliveryMethod != DeliveryMethodDelivery {
		benefit.Reason = "delivery_method_excluded"
		return benefit
	}
	if subtotalIDR < plan.MinimumSubtotalIDR {
		benefit.Reason = "minimum_subtotal_not_met"
		return benefit
	}
	now := time.Now()
	if !now.Before(entitlement.CurrentPeriodEnd) || now.Before(entitlement.CurrentPeriodStart) {
		benefit.Reason = "entitlement_expired"
		return benefit
	}
	if deliveryFeeIDR <= 0 || entitlement.FreeDeliveryRemainingIDR <= 0 {
		benefit.Reason = "subsidy_cap_exhausted"
		return benefit
	}
	benefit.DiscountIDR = minInt64(deliveryFeeIDR, entitlement.FreeDeliveryRemainingIDR)
	benefit.SubsidyIDR = benefit.DiscountIDR
	benefit.Eligible = benefit.DiscountIDR > 0
	benefit.EntitlementID = entitlement.ID
	if !benefit.Eligible {
		benefit.Reason = "no_eligible_delivery_fee"
	}
	return benefit
}

func ValidateMembershipSubscription(planID, idempotencyKey string) error {
	if strings.TrimSpace(planID) == "" {
		return fmt.Errorf("plan id is required")
	}
	if strings.TrimSpace(idempotencyKey) == "" {
		return fmt.Errorf("idempotency key is required")
	}
	return nil
}

func minInt64(a, b int64) int64 {
	if a < b {
		return a
	}
	return b
}
