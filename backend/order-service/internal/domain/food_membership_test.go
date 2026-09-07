package domain

import (
	"testing"
	"time"
)

func TestCalculateFoodMembershipBenefitExclusionsAndCap(t *testing.T) {
	now := time.Now()
	entitlement := &FoodMembershipEntitlement{ID: "ent-1", Status: MembershipActive, CurrentPeriodStart: now.Add(-time.Hour), CurrentPeriodEnd: now.Add(time.Hour), FreeDeliveryRemainingIDR: 7000}
	plan := &FoodMembershipPlan{ID: "plan-1", MinimumSubtotalIDR: 50000}
	benefit := CalculateFoodMembershipBenefit(entitlement, plan, 60000, 10000, DeliveryMethodDelivery)
	if !benefit.Eligible || benefit.DiscountIDR != 7000 || benefit.EntitlementID != "ent-1" { t.Fatalf("unexpected benefit: %+v", benefit) }
	if excluded := CalculateFoodMembershipBenefit(entitlement, plan, 60000, 10000, DeliveryMethodPickup); excluded.Eligible || excluded.Reason != "pickup_excluded" { t.Fatalf("pickup should be excluded: %+v", excluded) }
	if belowMinimum := CalculateFoodMembershipBenefit(entitlement, plan, 49999, 10000, DeliveryMethodDelivery); belowMinimum.Eligible || belowMinimum.Reason != "minimum_subtotal_not_met" { t.Fatalf("minimum should be enforced: %+v", belowMinimum) }
}
